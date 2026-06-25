# Bridge

Mission control for a company run by agents. A team of agents
(Chief of Staff · Scout · Analyst · Builder · Strategist) runs continuously,
turning seed ideas into briefs, market scans, MVP specs, GTM plans and more —
pushing everything to Supabase. The dashboard consumes it live. Seed ideas and
get milestone pings over WhatsApp.

```
WhatsApp ──▶ Modal webhook ──▶ Supabase ◀── Modal agent loop (Claude)
                                   │
                                   └── realtime ──▶ Next.js dashboard
```

Fully async by design: agents only ever *write* to Supabase; the dashboard only
ever *reads*. Nothing is coupled to the demo — the work just accumulates.

## Bring up (≈20 min to first artifacts)

1. **Supabase** — create a project, open the SQL editor, paste & run `schema.sql`.
2. **Backend**
   ```bash
   cd backend
   pip install -r requirements.txt
   cp .env.example .env        # fill in Supabase URL + service_role key + Anthropic key
   python seed.py "Paid newsletter for indie game devs"
   python loop.py              # starts producing artifacts every TICK_SECONDS
   ```
3. **Dashboard** (`dashboard/`) — set `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`, then `npm install && npm run dev`.
4. **Unattended (Modal)** — `modal secret create bridge ...` then `modal deploy backend/modal_app.py` (see the file header). This keeps the loop running for the 2-hour window even with the laptop closed.
5. **WhatsApp (Twilio sandbox)** — join the sandbox, set its inbound webhook to the Modal `/whatsapp` URL, add the Twilio vars to the `bridge` secret. Text it an idea → a venture appears → the team starts building it.

## What I need from you to go live (in parallel)

- **Supabase**: Project URL + `service_role` key + `anon` key
- **Anthropic**: an API key
- **Modal**: `pip install modal && modal setup`
- **Twilio** (for WhatsApp): Account SID + Auth Token — or say "Telegram" and we swap
