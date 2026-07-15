-- Supabase SQL Editor에서 1회 실행하세요.
-- Dashboard > Authentication > Providers > Anonymous Sign-Ins도 활성화해야 합니다.
-- Dashboard > Realtime Settings > Allow public access는 비활성화하세요.

alter table public.scoreboard enable row level security;
alter table public.scoreboard add column if not exists scoreboard_id uuid;
revoke insert, update, delete on table public.scoreboard from anon, authenticated;
grant select on table public.scoreboard to anon, authenticated;

drop policy if exists "scoreboard_public_read" on public.scoreboard;
create policy "scoreboard_public_read"
on public.scoreboard for select
to anon, authenticated
using (true);

create unique index if not exists scoreboard_scoreboard_id_unique
on public.scoreboard (scoreboard_id);

alter table realtime.messages enable row level security;

drop policy if exists "mathtetris_realtime_read" on realtime.messages;
create policy "mathtetris_realtime_read"
on realtime.messages for select
to authenticated
using ((select realtime.topic()) like 'mathtetris-%');

drop policy if exists "mathtetris_realtime_write" on realtime.messages;
create policy "mathtetris_realtime_write"
on realtime.messages for insert
to authenticated
with check ((select realtime.topic()) like 'mathtetris-%');
