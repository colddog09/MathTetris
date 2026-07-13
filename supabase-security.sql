-- Supabase SQL Editor에서 1회 실행하세요.
-- Dashboard > Authentication > Providers > Anonymous Sign-Ins도 활성화해야 합니다.
-- Dashboard > Realtime Settings > Allow public access는 비활성화하세요.

alter table public.scoreboard enable row level security;
alter table public.scoreboard add column if not exists scoreboard_id uuid;
alter table public.scoreboard add column if not exists leaderboard_bonus integer not null default 0;
revoke insert, update, delete on table public.scoreboard from anon, authenticated;
grant select on table public.scoreboard to anon, authenticated;

drop policy if exists "scoreboard_public_read" on public.scoreboard;
create policy "scoreboard_public_read"
on public.scoreboard for select
to anon, authenticated
using (true);

create unique index if not exists scoreboard_scoreboard_id_unique
on public.scoreboard (scoreboard_id);

-- 실제 코인 지급의 중복 실행을 막는 서버 전용 정산 원장입니다.
create table if not exists public.coin_settlements (
  settlement_key text primary key,
  student_id text not null,
  amount integer not null check (amount >= 0 and amount <= 50000),
  reason text not null,
  status text not null check (status in ('processing', 'completed', 'failed', 'unknown')),
  provider_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.coin_settlements enable row level security;
revoke all on table public.coin_settlements from anon, authenticated;

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
