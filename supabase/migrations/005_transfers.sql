-- ============================================================
-- Season-long transfer system
-- ============================================================

set search_path to public;

-- Add transfer tracking columns to fantasy_teams
alter table public.fantasy_teams
  add column if not exists transfers_used  int not null default 0,
  add column if not exists transfer_limit  int not null default 300;

-- Per-match transfer log
create table if not exists public.transfer_logs (
  id               uuid        primary key default gen_random_uuid(),
  fantasy_team_id  uuid        not null references public.fantasy_teams(id) on delete cascade,
  match_id         uuid        references public.matches(id) on delete set null,
  players_in       uuid[]      not null default '{}',
  players_out      uuid[]      not null default '{}',
  transfers_used   int         not null default 0,
  is_mega_transfer boolean     not null default false,
  admin_adjustment boolean     not null default false,
  admin_note       text,
  created_at       timestamptz not null default now()
);

-- One log row per (team, match) for real match logs; admin adjustments have null match_id
create unique index if not exists transfer_logs_team_match_unique
  on public.transfer_logs (fantasy_team_id, match_id)
  where match_id is not null;

-- RLS
alter table public.transfer_logs enable row level security;

create policy "Users read own transfer_logs"
  on public.transfer_logs for select
  using (
    exists (
      select 1 from public.fantasy_teams ft
      where ft.id = transfer_logs.fantasy_team_id
        and ft.user_id = auth.uid()
    )
  );

create policy "Users manage own transfer_logs"
  on public.transfer_logs for all
  using (
    exists (
      select 1 from public.fantasy_teams ft
      where ft.id = transfer_logs.fantasy_team_id
        and ft.user_id = auth.uid()
    )
  );

create policy "Admins manage all transfer_logs"
  on public.transfer_logs for all
  using (public.is_admin());
