"""Bridge — self-feeding pulse loop (Chief-of-Staff delegation).

The Chief of Staff GENERATES and DELEGATES tasks to the four specialist agents
(Scout, Analyst, Builder, Strategist), who CONSUME them from a queue each pulse.
It never just "stops": whenever a venture's queue runs low, CoS plans the next
2-4 deliverables and feeds them back in. A defensive PIPELINE/DEEPEN fallback
guarantees forward progress even if a model call returns junk.

Architecture
------------
- Queue == the Supabase `tasks` table. A queued deliverable is a `tasks` row with
  status 'queued' (visible backlog on the dashboard); it flips queued -> running
  -> done/failed. The per-task execution detail the `tasks` schema can't hold
  (artifact type + instruction) lives in an in-memory dict keyed by the inserted
  row id — NO schema migration.
- CoS orchestration pulse: for each active venture whose queue is low (< QUEUE_LOW
  queued+running), ONE Chief-of-Staff model call returns the next 2-4 tasks as
  JSON ({agent,type,title,instruction}) assigned to the fittest specialist. Parsed
  defensively; on failure we fall back to the next agents.PIPELINE/DEEPEN item.
- Worker pulse (~10s): claim up to 2 queued tasks (queued -> running) and run them
  CONCURRENTLY with asyncio. The inference endpoint is a SINGLE replica, so every
  model call (workers AND CoS) shares one global Semaphore(2) — we never burst it.
- Dedup: a (venture, type) already queued/running or present in the venture's
  recent artifacts is skipped (kills the "Pricing x3" spam from the last attempt).

Reuses loop.generate() for EVERY model call — it disables Qwen3.6 thinking via
extra_body, without which the model reasons past the budget and returns EMPTY
content. Pure asyncio; no multiprocessing, no child processes.

Run
---
    # bounded smoke test (~90s, warms the endpoint first, then exits cleanly):
    python pulse_loop.py --seconds 90 --warmup

    # production (indefinite) — the switchover target:
    python pulse_loop.py

Switchover: stop the old sequential `loop.py` process, then start
`python pulse_loop.py`. This file never touches loop.py and is safe to run
beside it (shared tables; overlapping writes are fine).
"""
import os

# --- Make env + imports cwd-independent BEFORE importing loop -----------------
# loop.py reads os.environ at import time, so populate the env first and chdir so
# loop.py's own load_dotenv() (relative) also resolves regardless of cwd.
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BACKEND_DIR)
from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

import argparse  # noqa: E402
import asyncio  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402
import time  # noqa: E402
import traceback  # noqa: E402
from collections import Counter  # noqa: E402
from datetime import datetime, timezone  # noqa: E402

from agents import DEEPEN, PIPELINE, build_messages  # noqa: E402
# REUSE loop's client + generate(): it has the REQUIRED Qwen3.6 thinking-disabled
# extra_body and the Modal cold-start retry. Do not hand-roll a model call.
from loop import generate, sb  # noqa: E402

# --- Tunables (overridable via CLI) ------------------------------------------
CONCURRENCY = 2          # max concurrent inference calls (single replica — never burst)
QUEUE_LOW = 2            # plan more when a venture has < this many queued+running tasks
WORKER_PULSE = 10.0      # worker claim cadence (s)
ORCH_PULSE = 10.0        # CoS planning cadence (s)
WORKER_DELAY = 3.0       # let CoS seed the queue before the first claim
GEN_RETRIES = int(os.environ.get("GEN_RETRIES", "6"))  # cold-start retries per call
RECENT_WINDOW = 10       # dedup against this many of a venture's most recent artifacts

WORKERS = ["Scout", "Analyst", "Builder", "Strategist"]  # CoS delegates to these only
DEEPEN_SUFFIX = " Build on the work already done; go deeper and do not repeat earlier documents."

# --- Shared state (mutated only on the asyncio event-loop thread) -------------
GEN_SEM: asyncio.Semaphore = None              # set in main_async (inference budget)
task_detail: dict[str, dict] = {}              # task_id -> {venture_id,agent,type,title,instruction,origin}
inflight_tasks: set[str] = set()               # task_ids a worker is currently executing
counters: Counter = Counter()
MY_ART_IDS: list[str] = []                     # artifact ids this process wrote (for verification)


def _now():
    return datetime.now(timezone.utc).isoformat()


# --- Blocking Supabase helpers (always called via asyncio.to_thread) ----------
def _active_ventures_sync():
    return sb.table("ventures").select("*").eq("status", "active").order("created_at").execute().data


def _venture_sync(vid):
    rows = sb.table("ventures").select("*").eq("id", vid).limit(1).execute().data
    return rows[0] if rows else None


def _artifacts_full_sync(vid):
    return sb.table("artifacts").select("type,title,body").eq("venture_id", vid).order("created_at").execute().data


def _done_types_sync(vid):
    rows = sb.table("artifacts").select("type").eq("venture_id", vid).execute().data
    return {r["type"] for r in rows if r.get("type")}


def _recent_types_sync(vid, n):
    rows = (sb.table("artifacts").select("type").eq("venture_id", vid)
            .order("created_at", desc=True).limit(n).execute().data)
    return {r["type"] for r in rows if r.get("type")}


def _recent_artifacts_sync(vid, n):
    rows = (sb.table("artifacts").select("type,title").eq("venture_id", vid)
            .order("created_at", desc=True).limit(n).execute().data)
    return list(reversed(rows))


def _pending_count_sync(vid):
    r = (sb.table("tasks").select("id", count="exact").eq("venture_id", vid)
         .in_("status", ["queued", "running"]).execute())
    return r.count or 0


def _queued_tasks_sync(limit):
    return sb.table("tasks").select("*").eq("status", "queued").order("created_at").limit(limit).execute().data


def _insert_task_sync(vid, agent, title):
    return sb.table("tasks").insert(
        {"venture_id": vid, "agent": agent, "title": title, "status": "queued"}
    ).execute().data[0]["id"]


def _claim_sync(tid):
    # queued -> running, guarded so a row is claimed at most once.
    res = sb.table("tasks").update({"status": "running"}).eq("id", tid).eq("status", "queued").execute()
    return bool(res.data)


def _set_status_sync(tid, status, done=False):
    patch = {"status": status}
    if done:
        patch["completed_at"] = _now()
    sb.table("tasks").update(patch).eq("id", tid).execute()


def _insert_artifact_sync(vid, agent, atype, title, body):
    return sb.table("artifacts").insert(
        {"venture_id": vid, "agent": agent, "type": atype, "title": title, "body": body}
    ).execute().data[0]["id"]


# --- CoS planning: parse + fallback -------------------------------------------
def _slug(s):
    s = re.sub(r"[^a-z0-9]+", "_", s.strip().lower()).strip("_")
    return s[:40] or "task"


def _normalize_agent(name):
    n = (name or "").strip().lower()
    for w in WORKERS:
        if w.lower() == n:
            return w
    for w in WORKERS:                 # fuzzy: "the scout", "builder agent", ...
        if w.lower() in n:
            return w
    return None                       # CoS / unknown -> not a worker; skip this task


def _parse_tasks(raw):
    """Defensively extract a JSON array of {agent,type,title,instruction}."""
    if not raw:
        return []
    s = raw.strip()
    if s.startswith("```"):                       # strip ```json ... ``` fences
        s = re.sub(r"^```[a-zA-Z]*", "", s).strip()
        if s.endswith("```"):
            s = s[:-3].strip()
    start, end = s.find("["), s.rfind("]")        # isolate the array, ignore prose
    if start != -1 and end != -1 and end > start:
        s = s[start:end + 1]
    try:
        data = json.loads(s)
    except Exception:
        return []
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        return []
    out = []
    for it in data:
        if not isinstance(it, dict):
            continue
        agent = _normalize_agent(str(it.get("agent", "")))
        atype = _slug(str(it.get("type", "")))
        title = str(it.get("title", "")).strip().strip('"*#').strip()
        instr = str(it.get("instruction", "")).strip()
        if not (agent and atype and title and instr):
            continue
        out.append({"agent": agent, "type": atype, "title": title[:80], "instruction": instr})
        if len(out) >= 4:
            break
    return out


def _fallback_task(blocked, recent):
    """Next agents.PIPELINE/DEEPEN deliverable not already blocked/recent. Always
    returns something so the loop never stalls (last resort ignores `recent`)."""
    for agent, atype, title, instr in PIPELINE:
        if atype not in blocked and atype not in recent:
            return {"agent": agent, "type": atype, "title": title, "instruction": instr}
    for agent, atype, title, instr in DEEPEN:
        if atype not in blocked and atype not in recent:
            return {"agent": agent, "type": atype, "title": title, "instruction": instr + DEEPEN_SUFFIX}
    for agent, atype, title, instr in DEEPEN:     # guarantee progress
        if atype not in blocked:
            return {"agent": agent, "type": atype, "title": title, "instruction": instr + DEEPEN_SUFFIX}
    return None


def _cos_messages(v, done_types, pending, recent_arts):
    system = (
        "You are Chief of Staff, the orchestrator of an autonomous founding team that builds "
        "real, fundable startups. You do NOT write the deliverables yourself — you DELEGATE. "
        "You break the venture's next move into concrete deliverables and assign each to the "
        "single most fitting specialist:\n"
        "- Scout: finds problems worth solving and validates real demand.\n"
        "- Analyst: maps the market and competitors, sizes the opportunity.\n"
        "- Builder: specs the MVP, names the product, build plan, pricing, metrics.\n"
        "- Strategist: go-to-market — positioning, channels, content, partnerships, first customers.\n"
        "You are decisive and non-redundant. You output machine-readable JSON only."
    )
    recent = "\n".join(f"- [{a['type']}] {a['title']}" for a in recent_arts) or "- (nothing yet)"
    user = (
        f"# Venture: {v['title']}\n"
        f"Seed idea: {v.get('seed_prompt') or v['title']}\n\n"
        f"Already produced (do NOT repeat these types): "
        f"{', '.join(sorted(done_types)) or 'nothing yet'}\n"
        f"Currently queued / in progress: {', '.join(sorted(pending)) or 'nothing'}\n\n"
        f"Recent work:\n{recent}\n\n"
        "Decide the next 2-4 highest-leverage deliverables that move this venture forward RIGHT NOW, "
        "and assign each to exactly one of: Scout, Analyst, Builder, Strategist (never yourself).\n"
        "If the venture is early, start with foundations: demand validation (Scout), market & "
        "competitor scan (Analyst), MVP product spec (Builder), go-to-market plan (Strategist). "
        "As it matures, go deeper (pricing, channel playbooks, competitor teardowns, content "
        "calendars, partnerships, metrics) WITHOUT repeating finished work.\n\n"
        "Return ONLY a JSON array — no prose, no code fence. Each element exactly:\n"
        '{"agent":"Scout|Analyst|Builder|Strategist","type":"snake_case_type",'
        '"title":"Short title","instruction":"One concrete, specific instruction for that agent."}'
    )
    return system, user


# --- Enqueue (writes the visible 'queued' tasks row + stores execution detail) -
async def _enqueue(vid, agent, atype, title, instr, origin):
    tid = await asyncio.to_thread(_insert_task_sync, vid, agent, title)
    task_detail[tid] = {"venture_id": vid, "agent": agent, "type": atype,
                        "title": title, "instruction": instr, "origin": origin}
    counters["enqueued"] += 1
    print(f"  + queued [{origin}] {agent} -> {title} ({atype})", flush=True)
    return tid


# --- CoS orchestration pulse --------------------------------------------------
async def orchestrate_venture(v):
    """ONE Chief-of-Staff call; enqueue the deduped next 2-4 delegated tasks.
    Falls back to PIPELINE/DEEPEN so the venture's queue never stays empty."""
    vid = v["id"]
    done_types = await asyncio.to_thread(_done_types_sync, vid)
    recent_types = await asyncio.to_thread(_recent_types_sync, vid, RECENT_WINDOW)
    recent_arts = await asyncio.to_thread(_recent_artifacts_sync, vid, 6)
    pending = {d["type"] for d in task_detail.values() if d["venture_id"] == vid}

    system, user = _cos_messages(v, done_types, pending, recent_arts)
    async with GEN_SEM:                            # CoS shares the inference budget
        raw = await asyncio.to_thread(generate, system, user, 1200, GEN_RETRIES)
    tasks = _parse_tasks(raw)
    if not tasks:
        counters["cos_parse_fallback"] += 1

    blocked = set(pending)                         # hard block: queued/running types
    n = 0
    for t in tasks:
        ty = t["type"]
        if ty in blocked or ty in recent_types:    # dedup (venture, type)
            counters["deduped"] += 1
            print(f"  ~ dedup {t['agent']} -> {t['title']} ({ty})", flush=True)
            continue
        await _enqueue(vid, t["agent"], ty, t["title"], t["instruction"], "cos")
        blocked.add(ty)
        n += 1

    if n == 0:                                     # never stop: nothing planned/all deduped
        fb = _fallback_task(blocked, recent_types)
        if fb:
            await _enqueue(vid, fb["agent"], fb["type"], fb["title"], fb["instruction"], "fallback")
            n += 1
    return n


async def orchestrator_loop(deadline):
    while time.monotonic() < deadline:
        try:
            for v in await asyncio.to_thread(_active_ventures_sync):
                if time.monotonic() >= deadline:
                    break
                depth = await asyncio.to_thread(_pending_count_sync, v["id"])
                if depth < QUEUE_LOW:
                    print(f"[cos] '{v['title'][:34]}' queue low ({depth}) — planning…", flush=True)
                    k = await orchestrate_venture(v)
                    print(f"[cos] '{v['title'][:34]}' delegated {k} task(s)", flush=True)
        except Exception:
            traceback.print_exc()
        await asyncio.sleep(ORCH_PULSE)


# --- Worker pulse -------------------------------------------------------------
def _detail_from_title(title):
    """Reconstruct execution detail for a queued row we have no memory of
    (e.g. left by a prior run). Best-effort match against the static catalogs."""
    for agent, atype, t, instr in (*PIPELINE, *DEEPEN):
        if t.strip().lower() == (title or "").strip().lower():
            return {"agent": agent, "type": atype, "title": t, "instruction": instr}
    return None


async def run_worker(tid, vid, detail):
    """queued->running already done; build context, generate, write artifact, done."""
    agent, atype = detail["agent"], detail["type"]
    title, instr = detail["title"], detail["instruction"]
    try:
        venture = await asyncio.to_thread(_venture_sync, vid)
        if not venture:
            raise RuntimeError("venture vanished")
        arts = await asyncio.to_thread(_artifacts_full_sync, vid)
        system, user = build_messages(venture, agent, instr, arts)
        async with GEN_SEM:                        # shared 2-slot inference budget
            body = await asyncio.to_thread(generate, system, user, 4000, GEN_RETRIES)
        if not body or not body.strip():
            raise ValueError("empty generation")   # never write a blank artifact
        aid = await asyncio.to_thread(_insert_artifact_sync, vid, agent, atype, title, body)
        MY_ART_IDS.append(aid)
        await asyncio.to_thread(_set_status_sync, tid, "done", True)
        counters["done"] += 1
        print(f"  done  {agent} -> {title} ({atype}) [{len(body)} chars]", flush=True)
    except Exception as e:
        counters["failed"] += 1
        print(f"  FAIL  {agent} -> {title}: {e.__class__.__name__}: {e}", flush=True)
        try:
            await asyncio.to_thread(_set_status_sync, tid, "failed")
        except Exception:
            traceback.print_exc()
    finally:
        inflight_tasks.discard(tid)
        task_detail.pop(tid, None)


async def claim_and_launch(bg):
    """Claim up to the free slots (max CONCURRENCY total) and run concurrently."""
    free = CONCURRENCY - len(inflight_tasks)
    if free <= 0:
        return
    launched = []
    for r in await asyncio.to_thread(_queued_tasks_sync, free):
        if len(inflight_tasks) >= CONCURRENCY:
            break
        tid = r["id"]
        if tid in inflight_tasks:
            continue
        detail = task_detail.get(tid) or _detail_from_title(r.get("title", ""))
        if not detail:                              # unknown leftover — clear it, don't block the queue
            await asyncio.to_thread(_set_status_sync, tid, "failed")
            continue
        if not await asyncio.to_thread(_claim_sync, tid):   # lost the race / already claimed
            continue
        task_detail[tid] = detail
        inflight_tasks.add(tid)
        t = asyncio.create_task(run_worker(tid, r["venture_id"], detail))
        bg.add(t)
        t.add_done_callback(bg.discard)
        launched.append(detail["agent"])
    if launched:
        print(f"[worker] claimed {len(launched)} concurrently: {', '.join(launched)} "
              f"(inflight={len(inflight_tasks)})", flush=True)


async def worker_loop(deadline):
    bg: set = set()
    await asyncio.sleep(WORKER_DELAY)               # let CoS seed first
    while time.monotonic() < deadline:
        try:
            await claim_and_launch(bg)
        except Exception:
            traceback.print_exc()
        await asyncio.sleep(WORKER_PULSE)
    if bg:                                          # drain in-flight work cleanly (no orphans)
        print(f"[worker] deadline reached — draining {len(bg)} in-flight task(s)…", flush=True)
        await asyncio.gather(*bg, return_exceptions=True)


# --- Warmup + summary ---------------------------------------------------------
async def warmup():
    print("Warming the Qwen endpoint (rides cold-start before the timed window)…", flush=True)
    t0 = time.monotonic()
    try:
        async with GEN_SEM:
            await asyncio.to_thread(generate, "You are a warmup probe.", "Reply with: ok", 16, GEN_RETRIES)
        print(f"  warm in {time.monotonic() - t0:.0f}s", flush=True)
    except Exception as e:
        print(f"  warmup failed ({e.__class__.__name__}) — cold-start retry will cover it", flush=True)


async def summary(start_iso):
    print("\n================ RUN SUMMARY ================", flush=True)
    print(f"  enqueued={counters['enqueued']} done={counters['done']} failed={counters['failed']} "
          f"deduped={counters['deduped']} cos_parse_fallbacks={counters['cos_parse_fallback']}", flush=True)
    try:
        tk = sb.table("tasks").select("status").gte("created_at", start_iso).execute().data
        by = Counter(t["status"] for t in tk)
        print(f"  DB tasks since start: {len(tk)} {dict(by)}", flush=True)
        # CRITICAL: re-read THIS process's artifacts and prove every body is non-empty.
        empties = []
        if MY_ART_IDS:
            rows = sb.table("artifacts").select("id,agent,type,title,body").in_("id", MY_ART_IDS).execute().data
            for a in sorted(rows, key=lambda r: r["title"]):
                blen = len((a.get("body") or "").strip())
                print(f"    • {a['agent']:10s} [{a['type']}] {a['title']} — {blen} chars", flush=True)
                if blen == 0:
                    empties.append(a["title"])
        print(f"  artifacts written by this run: {len(MY_ART_IDS)} | empty bodies: {len(empties)}", flush=True)
        print("  ALL ARTIFACT BODIES NON-EMPTY ✓" if not empties else f"  !! EMPTY: {empties}", flush=True)
    except Exception:
        traceback.print_exc()
    print("=============================================", flush=True)


# --- Orchestration ------------------------------------------------------------
async def main_async(args):
    global GEN_SEM, CONCURRENCY, QUEUE_LOW, WORKER_PULSE, ORCH_PULSE, GEN_RETRIES
    CONCURRENCY, QUEUE_LOW = args.concurrency, args.queue_low
    WORKER_PULSE, ORCH_PULSE, GEN_RETRIES = args.pulse, args.orch_pulse, args.retries
    GEN_SEM = asyncio.Semaphore(CONCURRENCY)

    start_iso = _now()
    mode = f"{args.seconds:.0f}s bounded test" if args.seconds > 0 else "indefinite (production)"
    print(f"Bridge pulse loop online | model={os.environ.get('MODEL')}\n"
          f"  concurrency={CONCURRENCY} queue_low={QUEUE_LOW} worker~{WORKER_PULSE}s "
          f"cos~{ORCH_PULSE}s retries={GEN_RETRIES} | mode={mode}", flush=True)

    if args.warmup:
        await warmup()

    deadline = time.monotonic() + args.seconds if args.seconds > 0 else float("inf")
    loops = [asyncio.create_task(orchestrator_loop(deadline)),
             asyncio.create_task(worker_loop(deadline))]
    try:
        await asyncio.gather(*loops)
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    await summary(start_iso)


def main():
    p = argparse.ArgumentParser(description="Bridge self-feeding CoS pulse loop")
    p.add_argument("--seconds", type=float, default=0, help="bounded run length; 0 = forever (production)")
    p.add_argument("--concurrency", type=int, default=CONCURRENCY, help="max concurrent model calls (keep 2)")
    p.add_argument("--queue-low", type=int, default=QUEUE_LOW, help="re-plan when queued+running < this")
    p.add_argument("--pulse", type=float, default=WORKER_PULSE, help="worker claim cadence (s)")
    p.add_argument("--orch-pulse", type=float, default=ORCH_PULSE, help="CoS planning cadence (s)")
    p.add_argument("--retries", type=int, default=GEN_RETRIES, help="cold-start retries per model call")
    p.add_argument("--warmup", action="store_true", help="pre-warm the endpoint before the timed window")
    args = p.parse_args()
    try:
        asyncio.run(main_async(args))
    except KeyboardInterrupt:
        print("\ninterrupted — bye", flush=True)


if __name__ == "__main__":
    main()
