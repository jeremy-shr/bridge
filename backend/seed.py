"""Seed a venture so the loop has something to build. Usage:

    python seed.py "Paid newsletter for indie game devs"
"""
import os
import sys

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

title = " ".join(sys.argv[1:]).strip() or "Paid newsletter for indie game devs"
v = sb.table("ventures").insert(
    {"title": title[:80], "seed_prompt": title, "status": "active"}
).execute().data[0]
sb.table("messages").insert(
    {"venture_id": v["id"], "direction": "system", "channel": "seed", "body": f"Venture seeded: {title}"}
).execute()
print("Seeded venture:", v["id"], "-", title)
