# Being WISE

Website for Being WISE — a Christian group for truth, research & growth.

- Live at https://www.beingwisestudy.com (Vercel; auto-deploys on push to `main`).
  `beingwisestudy.com` and `being-wise.vercel.app` redirect there.
- Leaders moderation: `/leaders/` (passcode = `ADMIN_KEY` env var until changed on the page;
  delete the `admin:passcode` Redis key to reset it)
- Static pages: `questions/` (active), `leaders/`; `index.html` and `content/` are
  currently redirected to `/questions/` via `vercel.json`, shared theme in `assets/styles.css`
- API (Vercel Functions): `api/questions.js`, `api/vote.js`, `api/admin.js`, backed by Upstash Redis
  via the Vercel Storage integration (`KV_REST_API_URL` / `KV_REST_API_TOKEN`)
