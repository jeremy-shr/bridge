"""Bridge agent loop. Run locally to start accumulating immediately:

    pip install -r requirements.txt
    cp .env.example .env   # fill it in (OPENAI_BASE_URL from `modal deploy llm_modal.py`)
    python seed.py "Paid newsletter for indie game devs"
    python loop.py

Each tick: pick the active venture with the least progress, run its next
pipeline step (or a deepen task), and write the result to Supabase. The
dashboard consumes it over realtime — fully async, nothing to break on stage.

Brains are an OpenAI-compatible endpoint (self-hosted Qwen on Modal via vLLM),
so swapping providers is just OPENAI_BASE_URL / MODEL in .env.
"""
import os
import time
import traceback
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client
from openai import OpenAI

from agents import PIPELINE, DEEPEN, build_messages

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
MODEL = os.environ.get("MODEL", "Qwen/Qwen2.5-32B-Instruct")
SLEEP = int(os.environ.get("TICK_SECONDS", "150"))

sb = create_client(SUPABASE_URL, SUPABASE_KEY)
# Modal managed endpoints authenticate with Modal-Key/Modal-Secret headers.
_modal_headers = {}
if os.environ.get("MODAL_KEY"):
    _modal_headers = {"Modal-Key": os.environ["MODAL_KEY"], "Modal-Secret": os.environ.get("MODAL_SECRET", "")}
ai = OpenAI(
    base_url=os.environ["OPENAI_BASE_URL"],
    api_key=os.environ.get("OPENAI_API_KEY", "modal"),
    default_headers=_modal_headers or None,
    timeout=180,
)


def _now():
    return datetime.now(timezone.utc).isoformat()


def generate(system, user, max_tokens=4000, retries=8):
    # Qwen3.6 is a reasoning model: it spends tokens on `reasoning_content`
    # before emitting `content`. Give it ample room (4000) so the answer isn't
    # truncated mid-thought, and fall back to the reasoning text if `content` is
    # still empty. Also retries through scale-to-zero cold-start 503s.
    last = None
    for attempt in range(retries):
        try:
            resp = ai.chat.completions.create(
                model=MODEL, max_tokens=max_tokens,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                # Qwen3.6 reasons by default and can burn the whole token budget thinking,
                # truncating before it answers. Disable thinking -> direct, full content.
                extra_body={"chat_template_kwargs": {"enable_thinking": False}},
            )
            msg = resp.choices[0].message
            text = (msg.content or "").strip()
            if not text:
                rc = getattr(msg, "reasoning_content", None) or (getattr(msg, "model_extra", None) or {}).get("reasoning_content")
                text = (rc or "").strip()
            if text:
                return text
            raise RuntimeError("empty completion")
        except Exception as e:
            last = e
            wait = min(30, 5 * (attempt + 1))
            print(f"  retry {attempt + 1}/{retries} ({e.__class__.__name__}) in {wait}s")
            time.sleep(wait)
    raise last


def notify(text):
    """Best-effort WhatsApp milestone ping. No-op if Twilio env isn't set."""
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    tok = os.environ.get("TWILIO_AUTH_TOKEN")
    frm = os.environ.get("TWILIO_WHATSAPP_FROM")
    to = os.environ.get("MY_WHATSAPP_TO")
    if not all([sid, tok, frm, to]):
        return
    try:
        from twilio.rest import Client
        Client(sid, tok).messages.create(from_=frm, to=to, body=text[:1500])
    except Exception:
        traceback.print_exc()


def active_ventures():
    return sb.table("ventures").select("*").eq("status", "active").order("created_at").execute().data


def venture_artifacts(vid):
    return sb.table("artifacts").select("type,title,body").eq("venture_id", vid).order("created_at").execute().data


def next_step(phase):
    if phase < len(PIPELINE):
        return PIPELINE[phase], True
    return DEEPEN[(phase - len(PIPELINE)) % len(DEEPEN)], False


def do_one(v):
    (agent, atype, title, instruction), is_pipeline = next_step(v["phase"])
    task = sb.table("tasks").insert(
        {"venture_id": v["id"], "agent": agent, "title": title, "status": "running"}
    ).execute().data[0]
    try:
        if not is_pipeline:
            instruction += " Build on the work already done; go deeper and do not repeat earlier documents."
        system, user = build_messages(v, agent, instruction, venture_artifacts(v["id"]))
        body = generate(system, user)
        sb.table("artifacts").insert(
            {"venture_id": v["id"], "agent": agent, "type": atype, "title": title, "body": body}
        ).execute()
        sb.table("tasks").update({"status": "done", "completed_at": _now()}).eq("id", task["id"]).execute()
        sb.table("ventures").update({"phase": v["phase"] + 1}).eq("id", v["id"]).execute()
        print(f"[{v['title'][:30]}] {agent} -> {title}")
        if is_pipeline:
            notify(f"\U0001F7E2 {agent} finished “{title}” for {v['title']}")
    except Exception:
        sb.table("tasks").update({"status": "failed"}).eq("id", task["id"]).execute()
        traceback.print_exc()


def tick():
    vs = active_ventures()
    if not vs:
        print('No active ventures — seed one: python seed.py "..."  (or WhatsApp it in)')
        return
    do_one(sorted(vs, key=lambda x: x["phase"])[0])


if __name__ == "__main__":
    print(f"Bridge loop online · model={MODEL} · tick={SLEEP}s")
    while True:
        try:
            tick()
        except Exception:
            traceback.print_exc()
        time.sleep(SLEEP)
