"""Run the agent loop unattended on Modal (laptop-sleep-proof) + host the
WhatsApp webhook.

    pip install modal && modal setup
    modal secret create bridge \
        ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
        MODEL=claude-sonnet-4-6 \
        TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... \
        TWILIO_WHATSAPP_FROM=whatsapp:+14155238886 MY_WHATSAPP_TO=whatsapp:+1XXXXXXXXXX
    modal deploy modal_app.py

Then point the Twilio WhatsApp sandbox "WHEN A MESSAGE COMES IN" webhook (POST)
at the printed  https://<...>-web.modal.run/whatsapp  URL.
"""
import os
import modal

image = (
    modal.Image.debian_slim()
    .pip_install("anthropic", "supabase", "python-dotenv", "twilio", "fastapi[standard]")
    .add_local_python_source("agents", "loop")  # older Modal: use modal.Mount instead
)
app = modal.App("bridge")
secrets = [modal.Secret.from_name("bridge")]


@app.function(image=image, schedule=modal.Period(seconds=150), secrets=secrets, timeout=300)
def scheduled_tick():
    import loop
    loop.tick()


@app.function(image=image, secrets=secrets)
@modal.asgi_app()
def web():
    from fastapi import FastAPI, Request, Response
    from supabase import create_client

    api = FastAPI()

    @api.post("/whatsapp")
    async def whatsapp(request: Request):
        form = await request.form()
        body = (form.get("Body") or "").strip()
        if body:
            sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
            v = sb.table("ventures").insert(
                {"title": body[:80], "seed_prompt": body, "status": "active"}
            ).execute().data[0]
            sb.table("messages").insert(
                {"venture_id": v["id"], "direction": "in", "channel": "whatsapp", "body": body}
            ).execute()
        return Response(content="<Response></Response>", media_type="application/xml")

    return api
