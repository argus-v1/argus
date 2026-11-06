# web/ — the public Argus site

Next.js 16 (App Router) + Supabase, deployed on Vercel. Public and **read-only**: it reads the T2 event log
(`supabase/migrations/20261105120000_event_log.sql`) with the anon key; RLS allows select only. Never add
approvals, agent chat, settings or any write path here.

## Run
- Live: https://argus-alpha-sand.vercel.app (Vercel project `argus`, team ayush-org). Redeploy: `cd web && npx vercel deploy --prod --yes`.
- `npm run dev` / `npm run build` / `npx tsc --noEmit`
- Env (`web/.env.local`, git-ignored; set the same on Vercel): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_GITHUB_APP_SLUG` (argus-v1).
- Append `?static` to any URL to settle all motion (for screenshots and review).

## Routes (contract with the orchestrator — do not rename)
- `/` landing · `/console` overview · `/investigations` list · `/evals`
- `/investigations/<owner>/<repo>/<pr>/<attempt>` and `…/bundle`: the Scribe's GitHub comment links here via
  `ARGUS_SITE_URL` + `fill_links()` in orchestrator/argus/investigation.py.

## Design
- PRODUCT.md (product truth), `.impeccable/surfaces/` (direction brief). Approved prototype: `design/landing.html`.
- World: Argus myth paintings (Velázquez, Rubens; public domain) on a near-black ground; Spectral serif display,
  Geist body, Geist Mono for evidence. Gold `#d9b673` is brand only. Role colours identify roles only; status
  colours (green/red/amber) carry a glyph and a word, never colour alone.
- Styles: `app/globals.css` (tokens, nav, shared), `app/landing.css`, `app/console.css`. Class names are global:
  check for collisions across the three files before adding one.

## Data the site wishes it had (requests to the orchestrator owner, argus-c7)
1. Done 2026-11-06: `ARGUS_SITE_URL=https://argus-alpha-sand.vercel.app` added to the root `.env`; the orchestrator picks it up on its next restart.
2. On each `test_run` event, add to `data`: `content` (the test file, for `test_argus_*` files) and
   `log_tail` (last 20 lines of the run's .log). No schema change; the bundle page already renders `content`.
