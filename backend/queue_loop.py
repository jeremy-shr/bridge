"""Bridge — queue + pulse, concurrent multi-agent dispatcher.

This is the v2 brain that REPLACES the single sequential `loop.py`. It does not
touch loop.py and is safe to run alongside it (they share the same Supabase
tables; minor overlapping writes are fine). Switch over by stopping the old
loop process and starting this one.

What it does
------------
- Queue (in-memory): each work item carries its full execution detail
  (agent, type, title, instruction, venture_id, origin). Queue state is mirrored
  to the UI by writing a `tasks` row with status='queued' on enqueue, then
  'running' -> 'done'/'failed' as it is processed. No schema migration.
- Pulse: wakes every ~5-8s, claims up to N queued items and runs them
  CONCURRENTLY (asyncio + a thread pool around loop.generate's cold-start
  retry), so multiple agents are visibly working at once.
- Emergent pipeline: on completion, sensible next steps are enqueued
  (brief -> validation + market scan -> MVP spec -> GTM -> copy/risks ...),
  not a fixed phase index. DEEPEN tasks feed the queue so it never runs dry.
- Scout discovery pulse (headline feature): periodically, if active ventures
  are under a cap, a Scout agent SOURCES A BRAND-NEW IDEA and spins up a new
  venture (ventures row + messages row + seeded backlog) — idea sourcing live.

Run
---
    # bounded smoke test (forces a discovery inside the window):
    python queue_loop.py --seconds 90 --discover-now --discovery 45 --warmup

    # production (indefinite) — this is the switchover target:
    python queue_loop.py

Standalone: it does NOT import loop.py (so the old loop can't be triggered) and
replicates loop.py's Modal client + cold-start retry, adding a reasoning-model
fix (thinking disabled) so Qwen3.6 returns real content instead of blank
artifacts. Reuses agents.py's personas/pipeline.
"""
import os

# --- Make env + imports cwd-independent BEFORE importing loop -----------------
# loop.py reads os.environ at import time, so the env must be populated first.
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BACKEND_DIR)
from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

import argparse  # noqa: E402
import asyncio  # noqa: E402
import random  # noqa: E402
import time  # noqa: E402
import traceback  # noqa: E402
from collections import Counter, defaultdict, deque  # noqa: E402
from dataclasses import dataclass  # noqa: E402
from datetime import datetime, timezone  # noqa: E402

from openai import OpenAI  # noqa: E402
from supabase import create_client  # noqa: E402

from agents import AGENTS, DEEPEN, PIPELINE, build_messages  # noqa: E402

# Our own Supabase client. Same anon/service key the rest of Bridge uses.
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

# --- Brains: same Modal/OpenAI-compatible endpoint as loop.py -----------------
# Replicates loop.py's client + cold-start retry, but with one critical fix:
# MODEL is Qwen3.6 (a *reasoning* model). With the server's reasoning parser the
# whole token budget is spent in the <think> block (returned as reasoning_content)
# and message.content comes back EMPTY (finish_reason=length) — which is why the
# old loop and a naive port both write blank artifacts. Disabling thinking via
# chat_template_kwargs makes the model answer directly: fast, clean, non-empty.
MODEL = os.environ.get("MODEL", "Qwen/Qwen2.5-32B-Instruct")
ENABLE_THINKING = os.environ.get("ENABLE_THINKING", "false").lower() in ("1", "true", "yes")
_GEN_EXTRA = {} if ENABLE_THINKING else {"chat_template_kwargs": {"enable_thinking": False}}

_modal_headers = {}
if os.environ.get("MODAL_KEY"):
    _modal_headers = {"Modal-Key": os.environ["MODAL_KEY"], "Modal-Secret": os.environ.get("MODAL_SECRET", "")}
ai = OpenAI(
    base_url=os.environ["OPENAI_BASE_URL"],
    api_key=os.environ.get("OPENAI_API_KEY", "modal"),
    default_headers=_modal_headers or None,
    timeout=180,
)


def generate(system, user, max_tokens=1400, retries=8):
    """One model call with the same cold-start retry as loop.generate(), plus a
    reasoning-model guard: thinking is disabled so content lands directly, and if
    a server build still exhausts the budget on reasoning we retry once with a
    bigger budget rather than return a blank artifact."""
    last = None
    for attempt in range(retries):
        try:
            resp = ai.chat.completions.create(
                model=MODEL, max_tokens=max_tokens,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                extra_body=_GEN_EXTRA or None,
            )
            msg = resp.choices[0].message
            content = (msg.content or "").strip()
            if content:
                return content
            # Empty content despite no_think: server ignored the flag and spent
            # the budget thinking. Bump the budget once so the answer can land.
            reasoning = (getattr(msg, "reasoning_content", None) or "").strip()
            if reasoning and max_tokens < 6000:
                max_tokens = 6000
                continue
            return ""  # genuinely empty — caller marks the task failed
        except Exception as e:
            last = e
            wait = min(30, 5 * (attempt + 1))
            print(f"  endpoint warming ({e.__class__.__name__}); retry {attempt + 1}/{retries} in {wait}s", flush=True)
            time.sleep(wait)
    raise last

# --- Tunables (overridable via CLI / env) ------------------------------------
CONCURRENCY = int(os.environ.get("PULSE_CONCURRENCY", "3"))      # agents working at once
PULSE_SECONDS = float(os.environ.get("PULSE_SECONDS", "6"))     # base pulse cadence (5-8s)
DISCOVERY_SECONDS = float(os.environ.get("DISCOVERY_SECONDS", "210"))  # scout discovery cadence
DISCOVERY_DELAY = float(os.environ.get("DISCOVERY_DELAY", "30"))      # first discovery after start
MAX_ACTIVE_VENTURES = int(os.environ.get("MAX_ACTIVE_VENTURES", "8")) # cap before scout pauses
MONITOR_SECONDS = float(os.environ.get("MONITOR_SECONDS", "12"))      # live DB heartbeat

# --- Emergent pipeline wiring (derived from agents.PIPELINE) ------------------
# (agent, atype, title, instruction) keyed by artifact type.
PIPELINE_BY_TYPE = {atype: (agent, atype, title, instr) for (agent, atype, title, instr) in PIPELINE}
PIPELINE_TYPES = [atype for (_, atype, _, _) in PIPELINE]  # ordered backbone

# On completing X, enqueue these next steps (deduped per venture). This is the
# "emergent pipeline": a small graph instead of a fixed index.
FOLLOWUPS = {
    "brief":        ["validation", "market_scan"],
    "validation":   ["product_spec"],
    "market_scan":  ["product_spec"],   # diamond: spec enqueued once (dedup)
    "product_spec": ["gtm"],
    "gtm":          ["copy", "risks"],
    "copy":         [],                 # pipeline tail -> DEEPEN feeder takes over
    "risks":        [],
}

DEEPEN_SUFFIX = " Build on the work already done; go deeper and do not repeat earlier documents."


def _now():
    return datetime.now(timezone.utc).isoformat()


# --- Work item ---------------------------------------------------------------
@dataclass
class WorkItem:
    venture_id: str
    agent: str
    atype: str
    title: str
    instruction: str
    origin: str = "seed"            # seed | followup | feeder | deepen | discovery
    task_id: str | None = None      # Supabase tasks row id (set on enqueue)


# --- Dispatcher state (all mutated only on the asyncio event-loop thread) -----
queue: deque[WorkItem] = deque()
enqueued_types: dict[str, set] = defaultdict(set)  # venture_id -> pipeline atypes already enqueued/done
deepen_idx: dict[str, int] = defaultdict(int)      # venture_id -> next DEEPEN index
inflight = 0                                        # claimed-but-not-finished count
counters: Counter = Counter()
_rr = {"i": 0}                                      # round-robin cursor for the feeder


# --- Small blocking DB helpers (always called via asyncio.to_thread) ----------
def _active_ventures_sync():
    return sb.table("ventures").select("*").eq("status", "active").order("created_at").execute().data


def _venture_sync(vid):
    rows = sb.table("ventures").select("*").eq("id", vid).limit(1).execute().data
    return rows[0] if rows else None


def _artifact_types_sync(vid):
    rows = sb.table("artifacts").select("type").eq("venture_id", vid).execute().data
    return {r["type"] for r in rows}


def _insert_task_sync(item: WorkItem):
    return sb.table("tasks").insert(
        {"venture_id": item.venture_id, "agent": item.agent, "title": item.title, "status": "queued"}
    ).execute().data[0]["id"]


def _set_task_status_sync(task_id, status, done=False):
    patch = {"status": status}
    if done:
        patch["completed_at"] = _now()
    sb.table("tasks").update(patch).eq("id", task_id).execute()


# --- Enqueue primitives (coroutines, run on the loop thread) ------------------
async def enqueue(item: WorkItem):
    """Mirror to UI as a 'queued' task row, then push onto the in-memory queue."""
    item.task_id = await asyncio.to_thread(_insert_task_sync, item)
    if item.atype in PIPELINE_TYPES:
        enqueued_types[item.venture_id].add(item.atype)
    queue.append(item)
    counters["enqueued"] += 1
    print(f"  + queued [{item.origin}] {item.agent} -> {item.title}  (q={len(queue)})", flush=True)


def _spec_item(vid, atype, origin):
    agent, _atype, title, instr = PIPELINE_BY_TYPE[atype]
    return WorkItem(venture_id=vid, agent=agent, atype=atype, title=title, instruction=instr, origin=origin)


async def enqueue_deepen(vid, origin="deepen"):
    idx = deepen_idx[vid]
    deepen_idx[vid] += 1
    agent, atype, title, instr = DEEPEN[idx % len(DEEPEN)]
    await enqueue(WorkItem(venture_id=vid, agent=agent, atype=atype, title=title,
                           instruction=instr + DEEPEN_SUFFIX, origin=origin))


async def enqueue_next(vid, origin):
    """Continue the pipeline if incomplete, else deepen. Used for seeding + feeder."""
    for atype in PIPELINE_TYPES:
        if atype not in enqueued_types[vid]:
            await enqueue(_spec_item(vid, atype, origin))
            return
    await enqueue_deepen(vid, origin=origin)


async def seed_backlog(venture):
    """Seed a venture's initial queue. Existing artifacts are treated as already
    done so we continue from where the venture actually is (no redundant briefs)."""
    vid = venture["id"]
    done = await asyncio.to_thread(_artifact_types_sync, vid)
    enqueued_types[vid] |= done
    await enqueue_next(vid, origin="seed")


# --- Execute one work item (the blocking part runs in a worker thread) --------
def _execute_sync(item: WorkItem):
    """queued -> running, build context, model call, write artifact, mark done.
    Runs entirely in a thread; returns nothing on success, raises on failure."""
    _set_task_status_sync(item.task_id, "running")
    venture = _venture_sync(item.venture_id)
    if not venture:
        raise RuntimeError(f"venture {item.venture_id} vanished")
    arts = sb.table("artifacts").select("type,title,body").eq(
        "venture_id", item.venture_id).order("created_at").execute().data
    system, user = build_messages(venture, item.agent, item.instruction, arts)
    body = generate(system, user)               # cold-start retry + thinking disabled
    if not body.strip():
        raise ValueError("empty generation")
    sb.table("artifacts").insert(
        {"venture_id": item.venture_id, "agent": item.agent, "type": item.atype,
         "title": item.title, "body": body}
    ).execute()
    _set_task_status_sync(item.task_id, "done", done=True)


async def run_item(item: WorkItem):
    """Await the blocking execution, then enqueue emergent follow-ups. Robust:
    a failure here marks the task 'failed' and never propagates to the pulse."""
    global inflight
    try:
        await asyncio.to_thread(_execute_sync, item)
        counters["done"] += 1
        print(f"  done  {item.agent} -> {item.title}  [{item.atype}]", flush=True)
        for nxt in FOLLOWUPS.get(item.atype, []):
            if nxt not in enqueued_types[item.venture_id]:
                await enqueue(_spec_item(item.venture_id, nxt, origin="followup"))
                counters["followup"] += 1
    except Exception as e:
        counters["failed"] += 1
        print(f"  FAIL  {item.agent} -> {item.title}: {e.__class__.__name__}: {e}", flush=True)
        if item.task_id:
            try:
                await asyncio.to_thread(_set_task_status_sync, item.task_id, "failed")
            except Exception:
                traceback.print_exc()
    finally:
        inflight -= 1


# --- Scout discovery: source a brand-new venture ------------------------------
def _discover_idea_sync(existing_titles):
    persona = AGENTS["Scout"]
    system = (
        f"You are Scout, {persona}, on an autonomous startup studio. You source ONE "
        "brand-new, specific, fundable startup idea grounded in a real and painful "
        "problem a clear customer has today. Be concrete and non-obvious; avoid "
        "generic SaaS filler and anything resembling the studio's existing ventures."
    )
    avoid = "\n".join(f"- {t}" for t in existing_titles) or "- (none yet)"
    user = (
        "The studio already runs these ventures — do NOT duplicate or closely "
        f"resemble them:\n{avoid}\n\n"
        "Source ONE new venture. Respond in EXACTLY this format and nothing else:\n"
        "TITLE: <crisp, specific venture title, max 70 chars>\n"
        "PITCH: <one vivid sentence: who has the problem and the wedge>"
    )
    out = generate(system, user, max_tokens=200)
    title, pitch = "", ""
    for line in out.splitlines():
        s = line.strip()
        if s.upper().startswith("TITLE:"):
            title = s.split(":", 1)[1].strip().strip("\"*")
        elif s.upper().startswith("PITCH:"):
            pitch = s.split(":", 1)[1].strip().strip("\"*")
    if not title:  # fallback: first non-empty line
        for line in out.splitlines():
            if line.strip():
                title = line.strip().strip("#*\" ")
                break
    return (title[:80] or "Untitled venture"), (pitch or "")


async def discover_one():
    active = await asyncio.to_thread(_active_ventures_sync)
    if len(active) >= MAX_ACTIVE_VENTURES:
        print(f"  scout: at cap ({len(active)}/{MAX_ACTIVE_VENTURES}) — skipping discovery", flush=True)
        return None
    title, pitch = await asyncio.to_thread(_discover_idea_sync, [v["title"] for v in active])
    seed = f"{title} — {pitch}" if pitch else title
    venture = await asyncio.to_thread(
        lambda: sb.table("ventures").insert(
            {"title": title, "seed_prompt": seed, "status": "active"}
        ).execute().data[0]
    )
    await asyncio.to_thread(
        lambda: sb.table("messages").insert(
            {"venture_id": venture["id"], "direction": "system", "channel": "scout",
             "body": f"\U0001F50D Scout sourced a new venture: {title}" + (f" — {pitch}" if pitch else "")}
        ).execute()
    )
    counters["discovered"] += 1
    print(f"\n*** SCOUT DISCOVERED a new venture: {title}\n    {pitch}\n", flush=True)
    await seed_backlog(venture)
    return venture


# --- The three concurrent loops ----------------------------------------------
async def pulse_loop(deadline):
    """Every pulse: top up the queue if it dried, then claim up to the free
    concurrency slots and launch them as background tasks (steady N in flight)."""
    global inflight
    background: set = set()
    while time.monotonic() < deadline:
        # Feeder: never run dry. Fill toward CONCURRENCY using round-robin ventures.
        if len(queue) + inflight < CONCURRENCY:
            active = await asyncio.to_thread(_active_ventures_sync)
            tries = 0
            while active and len(queue) + inflight < CONCURRENCY and tries < CONCURRENCY:
                v = active[_rr["i"] % len(active)]
                _rr["i"] += 1
                tries += 1
                await enqueue_next(v["id"], origin="feeder")

        # Claim up to the number of free slots and launch concurrently.
        slots = CONCURRENCY - inflight
        launched = []
        while queue and len(launched) < slots:
            launched.append(queue.popleft())
        for item in launched:
            inflight += 1  # reserve the slot on the loop thread (accurate accounting)
            t = asyncio.create_task(run_item(item))
            background.add(t)
            t.add_done_callback(background.discard)
        if launched:
            who = ", ".join(f"{i.agent}" for i in launched)
            print(f"[pulse] dispatched {len(launched)} concurrently: {who}  "
                  f"(inflight={inflight}, q={len(queue)})", flush=True)

        await asyncio.sleep(random.uniform(max(1.0, PULSE_SECONDS - 1), PULSE_SECONDS + 2))

    # Drain outstanding work (bounded) so artifacts/tasks finish cleanly.
    if background:
        print(f"[pulse] deadline reached — draining {len(background)} in-flight tasks...", flush=True)
        await asyncio.gather(*background, return_exceptions=True)


async def discovery_loop(deadline, initial_delay):
    await asyncio.sleep(initial_delay)
    while time.monotonic() < deadline:
        try:
            await discover_one()
        except Exception:
            traceback.print_exc()
        await asyncio.sleep(DISCOVERY_SECONDS)


async def monitor_loop(deadline, start_iso):
    """DB-backed heartbeat: counts of tasks/artifacts/ventures created since start,
    grouped by live status — proof of the queue and concurrency in the database."""
    while time.monotonic() < deadline:
        await asyncio.sleep(MONITOR_SECONDS)
        try:
            tasks = await asyncio.to_thread(
                lambda: sb.table("tasks").select("status").gte("created_at", start_iso).execute().data)
            arts = await asyncio.to_thread(
                lambda: sb.table("artifacts").select("id", count="exact").gte("created_at", start_iso).execute().count)
            vens = await asyncio.to_thread(
                lambda: sb.table("ventures").select("id", count="exact").gte("created_at", start_iso).execute().count)
            by = Counter(t["status"] for t in tasks)
            print(f"[monitor] mem(q={len(queue)} inflight={inflight}) | "
                  f"db-since-start: tasks queued={by.get('queued',0)} running={by.get('running',0)} "
                  f"done={by.get('done',0)} failed={by.get('failed',0)} | "
                  f"artifacts={arts} new_ventures={vens}", flush=True)
        except Exception:
            traceback.print_exc()


async def warmup_endpoint():
    print("Warming the Qwen endpoint (rides cold-start so the timed run is clean)...", flush=True)
    t0 = time.monotonic()
    try:
        await asyncio.to_thread(lambda: generate("You are a warmup probe.", "Reply with: ok", max_tokens=16))
        print(f"  endpoint warm in {time.monotonic() - t0:.0f}s", flush=True)
    except Exception as e:
        print(f"  warmup failed ({e.__class__.__name__}) — continuing; cold-start retry will cover it", flush=True)


# --- Orchestration ------------------------------------------------------------
async def main_async(args):
    global CONCURRENCY, PULSE_SECONDS, DISCOVERY_SECONDS, MAX_ACTIVE_VENTURES
    CONCURRENCY = args.concurrency
    PULSE_SECONDS = args.pulse
    DISCOVERY_SECONDS = args.discovery
    MAX_ACTIVE_VENTURES = args.max_ventures

    start_iso = _now()  # captured early so DB "since start" counts include seeding
    mode = f"{args.seconds}s bounded test" if args.seconds > 0 else "indefinite (production)"
    print(f"Bridge queue+pulse online | model={MODEL}\n"
          f"  concurrency={CONCURRENCY} pulse~{PULSE_SECONDS}s discovery={DISCOVERY_SECONDS}s "
          f"cap={MAX_ACTIVE_VENTURES} | mode={mode}", flush=True)

    if args.warmup:
        await warmup_endpoint()  # before the timed window so cold-start doesn't eat it

    if args.seed_existing:
        active = await asyncio.to_thread(_active_ventures_sync)
        print(f"Seeding backlog for {len(active)} existing active venture(s)...", flush=True)
        for v in active:
            await seed_backlog(v)

    if args.discover_now:
        print("Forcing an immediate Scout discovery...", flush=True)
        try:
            await discover_one()
        except Exception:
            traceback.print_exc()

    # Start the timed dispatch window now (after warmup/seed), so --seconds is pure run time.
    deadline = time.monotonic() + args.seconds if args.seconds > 0 else float("inf")

    tasks = [
        asyncio.create_task(pulse_loop(deadline)),
        asyncio.create_task(discovery_loop(deadline, args.discovery_delay)),
    ]
    if args.seconds > 0:
        tasks.append(asyncio.create_task(monitor_loop(deadline, start_iso)))

    try:
        await asyncio.gather(*tasks)
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass

    # Final report (in-memory counters + DB snapshot since start).
    print("\n================ RUN SUMMARY ================", flush=True)
    print(f"  enqueued={counters['enqueued']} done={counters['done']} failed={counters['failed']} "
          f"followups={counters['followup']} discovered={counters['discovered']}", flush=True)
    try:
        tk = sb.table("tasks").select("status").gte("created_at", start_iso).execute().data
        arts = sb.table("artifacts").select("id", count="exact").gte("created_at", start_iso).execute().count
        vens = sb.table("ventures").select("title").gte("created_at", start_iso).execute().data
        by = Counter(t["status"] for t in tk)
        print(f"  DB since start: tasks={len(tk)} {dict(by)} | artifacts={arts} | "
              f"new ventures={len(vens)}", flush=True)
        for v in vens:
            print(f"    • new venture: {v['title']}", flush=True)
    except Exception:
        traceback.print_exc()
    print("=============================================", flush=True)


def main():
    p = argparse.ArgumentParser(description="Bridge queue + pulse concurrent dispatcher")
    p.add_argument("--seconds", type=float, default=0, help="bounded run length; 0 = run forever (production)")
    p.add_argument("--concurrency", type=int, default=CONCURRENCY, help="max agents working at once")
    p.add_argument("--pulse", type=float, default=PULSE_SECONDS, help="base pulse cadence (s)")
    p.add_argument("--discovery", type=float, default=DISCOVERY_SECONDS, help="scout discovery cadence (s)")
    p.add_argument("--discovery-delay", type=float, default=DISCOVERY_DELAY, help="delay before first discovery (s)")
    p.add_argument("--max-ventures", type=int, default=MAX_ACTIVE_VENTURES, help="cap active ventures before scout pauses")
    p.add_argument("--discover-now", action="store_true", help="force one discovery at startup")
    p.add_argument("--warmup", action="store_true", help="pre-warm the endpoint before the timed run")
    p.add_argument("--no-seed-existing", dest="seed_existing", action="store_false",
                   help="do not seed backlog for pre-existing active ventures")
    p.set_defaults(seed_existing=True)
    args = p.parse_args()
    try:
        asyncio.run(main_async(args))
    except KeyboardInterrupt:
        print("\ninterrupted — bye", flush=True)


if __name__ == "__main__":
    main()
