#!/usr/bin/env node
/**
 * Brand asset generator — Gemini image (Interactions API) + Veo video.
 * Reads GEMINI_API_KEY / GEMINI_IMAGE_MODEL / GEMINI_VIDEO_MODEL from .env.
 * Outputs land in scratch/branding/ and are NEVER committed; curated picks
 * are copied to public/brand/ by hand after the taste gate.
 *
 *   node scripts/genAsset.mjs image <slug> "<prompt>" [--ar 1:1] [--edit file.jpg] [--prev <id>]
 *   node scripts/genAsset.mjs video <slug> "<prompt>" --first frame.jpg [--last frame.jpg]
 *                                   [--res 720p|1080p] [--dur 4|6|8] [--negative "..."]
 *
 * Model constraints (verified 2026-07-07, see scratch/branding/NOTES.md):
 * image = JPEG only, 1K only, no alpha. video = always has audio (strip with
 * ffmpeg -an), first+last frame with the same image makes a seamless loop.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'scratch/branding');
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing from .env');
  return env;
}

function parseArgs(argv) {
  const [cmd, slug, prompt, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1] ?? '';
  }
  return { cmd, slug, prompt, flags };
}

async function api(path, body, key) {
  const res = await fetch(`${BASE}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

function b64Image(file) {
  const mime = extname(file) === '.png' ? 'image/png' : 'image/jpeg';
  return { mime, data: readFileSync(resolve(file)).toString('base64') };
}

async function genImage(env, slug, prompt, flags) {
  const input = [{ type: 'text', text: prompt }];
  if (flags.edit) {
    const { mime, data } = b64Image(flags.edit);
    input.push({ type: 'image', mime_type: mime, data });
  }
  const body = {
    model: env.GEMINI_IMAGE_MODEL,
    input,
    response_format: {
      type: 'image',
      mime_type: 'image/jpeg', // model rejects png output
      aspect_ratio: flags.ar ?? '1:1',
      image_size: '1K',
    },
  };
  if (flags.prev) body.previous_interaction_id = flags.prev;
  const json = await api('interactions', body, env.GEMINI_API_KEY);
  const step = (json.steps ?? []).find((s) => s.type === 'model_output');
  const img = step?.content?.find((c) => c.type === 'image');
  if (!img?.data) throw new Error(`no image in response: ${JSON.stringify(json).slice(0, 300)}`);
  const file = nextFile(slug, '.jpg');
  writeFileSync(file, Buffer.from(img.data, 'base64'));
  console.log(file);
  console.log(`interaction_id: ${json.id}`); // for --prev multi-turn edits
}

function nextFile(slug, ext) {
  mkdirSync(outDir, { recursive: true });
  for (let n = 1; ; n++) {
    const f = resolve(outDir, `${slug}-${n}${ext}`);
    try {
      readFileSync(f);
    } catch {
      return f;
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function genVideo(env, slug, prompt, flags) {
  if (!flags.first) throw new Error('--first <image> is required (use it as --last too for a loop)');
  const first = b64Image(flags.first);
  const instance = {
    prompt,
    image: { bytesBase64Encoded: first.data, mimeType: first.mime },
  };
  const lastPath = flags.last ?? flags.first; // same frame both ends = seamless loop
  const last = b64Image(lastPath);
  instance.lastFrame = { bytesBase64Encoded: last.data, mimeType: last.mime };

  const parameters = {
    aspectRatio: flags.ar ?? '16:9',
    resolution: flags.res ?? '720p',
    durationSeconds: Number(flags.dur ?? 8),
  };
  if (flags.negative) parameters.negativePrompt = flags.negative;

  const model = env.GEMINI_VIDEO_MODEL;
  const op = await api(`models/${model}:predictLongRunning`, { instances: [instance], parameters }, env.GEMINI_API_KEY);
  console.log(`operation: ${op.name} — polling every 10s`);
  let poll = op;
  while (!poll.done) {
    await sleep(10_000);
    poll = await api(op.name, null, env.GEMINI_API_KEY);
  }
  if (poll.error) throw new Error(`generation failed: ${JSON.stringify(poll.error)}`);
  const uri = poll.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error(`no video uri: ${JSON.stringify(poll.response).slice(0, 300)}`);
  const res = await fetch(uri, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY }, redirect: 'follow' });
  if (!res.ok) throw new Error(`download → HTTP ${res.status}`);
  const file = nextFile(slug, '.mp4');
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(file);
}

const { cmd, slug, prompt, flags } = parseArgs(process.argv.slice(2));
if (!cmd || !slug || !prompt) {
  console.error('usage: genAsset.mjs image|video <slug> "<prompt>" [flags]  (see file header)');
  process.exit(1);
}
const env = loadEnv();
try {
  if (cmd === 'image') await genImage(env, slug, prompt, flags);
  else if (cmd === 'video') await genVideo(env, slug, prompt, flags);
  else throw new Error(`unknown command "${cmd}"`);
} catch (err) {
  console.error(String(err.message ?? err));
  process.exit(1);
}
