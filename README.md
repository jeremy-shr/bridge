# Bridge

**Mission control for a company run by a team of AI agents.**

You're the operator, not the founder. A team of agents — **Chief of Staff, Scout, Analyst, Builder, Strategist** — runs your company on a self-feeding pulse: the Chief of Staff continuously plans and *delegates* work to the others, who pick it up from a shared queue and execute. They produce real strategy work (opportunity briefs, market scans, MVP specs, GTM plans, pricing, partnerships…), and for real-world actions they hand off to **Manus**, which builds and deploys actual landing pages. Seed a new company just by **texting an idea** over WhatsApp, and watch it all happen live in a single-company cockpit.

> cofounder lets you *run* a company with AI; polsia runs it *while you sleep*. Bridge lets you run it **while you watch** — a company that builds itself in front of you.

## Architecture

```
Wassist WhatsApp ──┐
                   ▼
              webhook.py
                   │  (new venture)
                   ▼
pulse_loop.py ──▶ Supabase ──realtime──▶ Next.js cockpit
(Qwen on Modal)     ▲                       (dashboard/)
   │                │
   └─▶ Manus        └─ agents only WRITE; the dashboard only READS
     (real landing pages)
```

Fully decoupled: the agents only ever **write** to Supabase; the dashboard only ever **reads** (via realtime). Nothing is coupled to a request — the company just keeps building.

## How it works

- **Self-feeding pulse loop** (`backend/pulse_loop.py`) — the production brain. Each pulse, the **Chief of Staff** checks every venture and, when its queue runs low, generates the next 2–4 tasks as structured JSON and **delegates** each to the right agent. Workers claim queued tasks and run them concurrently. It never stops — CoS refills the queue as it drains.
- **The agent team** (`backend/agents.py`) — five role personas; each task is executed by its assigned agent against the venture's prior work as context.
- **Real work via Manus** — action tasks (e.g. "build a landing page") are handed to the Manus API, and a real, deployed artifact comes back with a live URL.
- **WhatsApp intake** (`backend/webhook.py`) — a public webhook (run behind a tunnel) turns each inbound Wassist message into a new venture the team starts building.
- **The cockpit** (`dashboard/`) — a Next.js app. A **studio/home** shows the whole portfolio; click a company for its focused **cockpit** (build pipeline, live activity, the body of work, agent roster, comms). Open any artifact to read the full document.

**Brains:** Qwen3.6-35B-A3B on **Modal** (OpenAI-compatible; thinking disabled for direct output) · **Real actions:** **Manus** · **Idea intake:** **Wassist** WhatsApp · **State + realtime:** **Supabase** · **UI:** Next.js.

## Run it

**1. Supabase** — create a project, open the SQL editor, run `schema.sql`, then `fix_rls.sql` (disables RLS so the anon key can read + write — fine for a demo).

**2. Backend**
```bash
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                  # fill in the values (table below)
.venv/bin/python pulse_loop.py        # the self-feeding brain
#   (or  .venv/bin/python loop.py  for the simpler fixed-pipeline version)
```

**3. Dashboard**
```bash
cd dashboard
npm install
# set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
npm run dev                           # http://localhost:3000
```

**4. WhatsApp intake (optional)**
```bash
cd backend
.venv/bin/uvicorn webhook:app --host 0.0.0.0 --port 8787
cloudflared tunnel --url http://localhost:8787   # give the public <url>/whatsapp to Wassist
```

### Environment (`backend/.env`)
| var | what |
|---|---|
| `OPENAI_BASE_URL` | Modal inference endpoint, with `/v1` |
| `MODAL_KEY` / `MODAL_SECRET` | Modal endpoint auth headers |
| `MODEL` | `Qwen/Qwen3.6-35B-A3B` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Supabase project URL + key (anon works with RLS off) |
| `MANUS_API_KEY` | Manus API — real-world actions |
| `WASSIST_SIGNING_SECRET` | verify the `X-Wassist-Signature` header |

Dashboard needs `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `dashboard/.env.local`.

## Repo layout

```
backend/
  pulse_loop.py   self-feeding CoS-delegation loop (production brain)
  loop.py         simple fixed-pipeline loop (fallback)
  agents.py       the 5-agent team + pipeline + prompts
  webhook.py      Wassist WhatsApp → new venture
  seed.py         seed a venture from the CLI
  modal_app.py    optional: host the loop + webhook on Modal
  llm_modal.py    optional: self-host the model with vLLM on Modal (Plan B)
dashboard/        Next.js realtime mission-control cockpit
schema.sql        Supabase tables + realtime publication
fix_rls.sql       disable RLS for the hackathon
```

Built for the agent-run-companies hackathon — brains on Modal, real-world actions via Manus, idea intake via Wassist.
