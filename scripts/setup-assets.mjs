/**
 * Fetches the binary assets the app needs but the repo doesn't ship
 * (they're large and Apache-2.0 licensed upstream by Google/MediaPipe):
 *
 *   public/wasm/    ← copied from node_modules/@mediapipe/tasks-vision/wasm
 *   public/models/hand_landmarker.task ← downloaded from Google storage
 *
 * Runs automatically on `npm install` (postinstall) and is idempotent —
 * re-run it manually after upgrading @mediapipe/tasks-vision.
 */
import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDst = join(root, 'public', 'wasm');
const modelDst = join(root, 'public', 'models', 'hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';

async function exists(path) {
  return stat(path).then(() => true, () => false);
}

if (!(await exists(wasmSrc))) {
  console.error('setup-assets: @mediapipe/tasks-vision not installed yet — run npm install first.');
  process.exit(1);
}
await cp(wasmSrc, wasmDst, { recursive: true });
console.log('setup-assets: wasm copied to public/wasm/');

if (await exists(modelDst)) {
  console.log('setup-assets: hand_landmarker.task already present, skipping download');
} else {
  console.log('setup-assets: downloading hand_landmarker.task (~7 MB)…');
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    console.error(`setup-assets: model download failed (${res.status}). ` +
      `Download it manually from\n  ${MODEL_URL}\nand save as public/models/hand_landmarker.task`);
    process.exit(1);
  }
  await mkdir(dirname(modelDst), { recursive: true });
  await writeFile(modelDst, Buffer.from(await res.arrayBuffer()));
  console.log('setup-assets: model saved to public/models/hand_landmarker.task');
}
