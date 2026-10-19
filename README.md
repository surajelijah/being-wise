# Being WISE

Website for Being WISE — a Christian group for truth, research & growth.

- Hosted on Vercel: https://being-wise.vercel.app (auto-deploys on push to `main`)
- Static pages: `index.html`, `content/`, `questions/`, shared theme in `assets/styles.css`
- API (Vercel Functions): `api/questions.js`, `api/vote.js`, backed by Upstash Redis
  via the Vercel Storage integration (`KV_REST_API_URL` / `KV_REST_API_TOKEN`)
