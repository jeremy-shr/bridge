-- Bridge schema — paste into the Supabase SQL editor and run once.
-- RLS is left OFF for the hackathon so the dashboard's anon key can read freely.
-- The backend uses the service_role key (bypasses RLS regardless).

create table if not exists ventures (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  seed_prompt text,
  status      text not null default 'active',   -- active | paused | archived
  phase       int  not null default 0,          -- index into the build pipeline
  created_at  timestamptz not null default now()
);

create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  venture_id   uuid references ventures(id) on delete cascade,
  agent        text not null,                   -- Chief of Staff | Scout | Analyst | Builder | Strategist
  title        text not null,
  status       text not null default 'running', -- running | done | failed
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists artifacts (
  id          uuid primary key default gen_random_uuid(),
  venture_id  uuid references ventures(id) on delete cascade,
  agent       text not null,
  type        text not null,                    -- brief | validation | market_scan | product_spec | gtm | copy | risks | deep_dive | ...
  title       text not null,
  body        text not null,                    -- markdown
  created_at  timestamptz not null default now()
);

create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  venture_id  uuid references ventures(id) on delete set null,
  direction   text not null,                    -- in | out | system
  channel     text not null default 'whatsapp',
  body        text not null,
  created_at  timestamptz not null default now()
);

-- Realtime: stream inserts to the dashboard. (Run once; errors if already added.)
alter publication supabase_realtime add table ventures;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table artifacts;
alter publication supabase_realtime add table messages;
