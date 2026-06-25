# Bridge · Mission Control

A live ops-room dashboard for **Bridge**, a company run by a team of AI agents
(Chief of Staff, Scout, Analyst, Builder, Strategist). It reads from Supabase in
realtime and renders the accumulating work: live task activity, the wall of
artifacts the team produces, ventures in progress, the agent roster, and the
WhatsApp comms log.

Dark "mission control" aesthetic: cool near-black surfaces, a single amber accent,
green for live/healthy status, monospace for all metadata, tasteful motion.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

- **No Supabase creds?** It runs anyway, with intentional empty states.
- **Want to see it alive without a backend?** Open <http://localhost:3000/?demo=1>
  for a simulated realtime stream (tasks start and complete, artifacts and comms
  appear on a loop). Great for a demo screen.

## Environment

Copy `.env.local.example` to `.env.local`:

| Variable | Required | What |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | for live data | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for live data | Supabase public anon key |
| `NEXT_PUBLIC_DEMO` | no | set to `1` to force the simulated demo stream |

The dashboard only ever **reads** (anon key). It subscribes to Postgres
`INSERT` + `UPDATE` changes on `ventures`, `tasks`, `artifacts`, and `messages`,
and also does an initial fetch. The schema lives in `../schema.sql`; realtime must
be enabled for those four tables (the schema file does this).

## Build

```bash
npm run build && npm run start
```

## Deploy to Vercel

1. Push this `dashboard/` directory to a Git repo (or use the Vercel CLI:
   `npx vercel`).
2. In Vercel, **New Project** and import the repo. If the repo root is the Bridge
   monorepo, set the **Root Directory** to `dashboard`. The framework preset is
   detected as **Next.js**; no build settings to change.
3. Add the two environment variables (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`) under **Settings → Environment Variables**.
4. Deploy. To show the simulated stream on a public URL, either set
   `NEXT_PUBLIC_DEMO=1` or visit `https://your-app.vercel.app/?demo=1`.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · `@supabase/supabase-js`
(realtime) · `framer-motion` · `react-markdown` + `remark-gfm`. Fonts: IBM Plex
Sans + IBM Plex Mono via `next/font`.
