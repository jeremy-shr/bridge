-- Bridge: open the tables for the hackathon so the anon key can read AND write,
-- and the dashboard can see rows. Fine for a throwaway demo with fake data.
-- Run this in the Supabase SQL editor (it's why inserts were 401'ing).

alter table ventures  disable row level security;
alter table tasks     disable row level security;
alter table artifacts disable row level security;
alter table messages  disable row level security;
