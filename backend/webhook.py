"""Public webhook receiver for the WhatsApp sponsor. Each inbound message
becomes a new venture the agent team starts building.

  uvicorn webhook:app --host 0.0.0.0 --port 8787          # run locally
  cloudflared tunnel --url http://localhost:8787          # get a public https URL

Give the printed  https://<...>.trycloudflare.com/whatsapp  to the sponsor.
"""
import os
import json

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse, JSONResponse
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
app = FastAPI()


def extract(payload, form):
    """Pull the message text out of whatever shape the provider sends."""
    if isinstance(payload, dict):
        for k in ("message", "text", "body", "Body", "msg", "content", "caption"):
            v = payload.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
            if isinstance(v, dict):
                for kk in ("text", "body", "content"):
                    if isinstance(v.get(kk), str) and v[kk].strip():
                        return v[kk].strip()
        try:  # WhatsApp Cloud API nested shape
            m = payload["entry"][0]["changes"][0]["value"]["messages"][0]
            return (m.get("text", {}) or {}).get("body") or m.get("body") or ""
        except Exception:
            pass
    if form:
        for k in ("Body", "body", "message", "text"):
            if form.get(k):
                return str(form[k]).strip()
    return ""


@app.get("/whatsapp")
async def verify(request: Request):
    # Some providers verify the URL with a GET challenge before sending events.
    q = dict(request.query_params)
    challenge = q.get("hub.challenge") or q.get("challenge")
    if challenge:
        return PlainTextResponse(challenge)
    return JSONResponse({"ok": True})


@app.post("/whatsapp")
async def inbound(request: Request):
    payload, form = {}, {}
    try:
        payload = await request.json()
    except Exception:
        try:
            form = dict(await request.form())
        except Exception:
            pass
    raw = payload or form
    print("INBOUND:", json.dumps(raw, default=str)[:1000], flush=True)
    text = extract(payload, form)
    if not text:
        return JSONResponse({"ok": True, "note": "no message text found",
                             "saw_keys": list(raw.keys()) if isinstance(raw, dict) else None})
    v = sb.table("ventures").insert(
        {"title": text[:80], "seed_prompt": text, "status": "active"}
    ).execute().data[0]
    sb.table("messages").insert(
        {"venture_id": v["id"], "direction": "in", "channel": "whatsapp", "body": text}
    ).execute()
    print("-> seeded venture", v["id"], "|", text[:60], flush=True)
    return JSONResponse({"ok": True, "venture_id": v["id"]})


@app.get("/health")
async def health():
    return {"ok": True}
