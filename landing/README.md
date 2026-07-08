# FretArt landing page

Astro static site for [fretart.nguyenthaithieu.workers.dev](https://fretart.nguyenthaithieu.workers.dev),
built in the project brand ("The Human Press" — see `src/ui/theme.css` in the repo
root; the tokens here mirror it). Zero client JS except the hero-video motion gate,
which respects `prefers-reduced-motion` and data saver.

```
npm install
npm run dev        # local preview
npm run build      # → dist/
npm run deploy     # build + wrangler deploy (needs Cloudflare auth)
```

Deploys to Cloudflare Workers static assets (`wrangler.jsonc`). CI redeploys on
any push to `landing/**` via `.github/workflows/deploy-landing.yml`, which needs
the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets.

Brand assets in `public/brand/` are size-tuned derivatives of the curated set in
the repo root's `public/brand/` (source of truth). The page has commented
CAPTURE SLOT markers where real in-app recordings (`R`/`S`) drop in.
