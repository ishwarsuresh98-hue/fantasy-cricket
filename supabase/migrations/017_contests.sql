-- ── Migration 017: Contest / Private League system ─────────────────────────────
--
-- Creates two tables:
--   contests        — a named competition (public or private) within a season
--   contest_entries — which fantasy teams are in each contest
--
-- RLS design:
--   • All authenticated users can READ all contests (invite codes are visible only
--     to members in the app layer — no app-secret data is stored here).
--   • Any authenticated user may INSERT a 'private' contest (private leagues).
--   • Only admins may INSERT a 'public' contest.
--   • Users may UPDATE / DELETE contests they created; admins can touch anything.
--   • Any authenticated user owning a fantasy_team may join / leave a contest.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── contests ──────────────────────────────────────────────────────────────────

create table if not exists public.contests (
  id                uuid        primary key default gen_random_uuid(),
  season_id         uuid        not null references public.seasons(id) on delete cascade,
  name              text        not null,
  type              text        not null check (type in ('public', 'private')),
  entry_code        text        unique,          -- 6-char code; null for open-join public
  max_teams         integer     not null default 100,
  prize_description text,
  created_by        uuid        not null references auth.users(id),
  created_at        timestamptz not null default now()
);

alter table public.contests enable row level security;

-- Everyone can browse contests
create policy "contests_select"
  on public.contests for select
  to authenticated
  using (true);

-- Authenticated users can create private leagues;
-- admins can create public ones too
create policy "contests_insert"
  on public.contests for insert
  to authenticated
  with check (
    type = 'private'
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Creator or admin can update
create policy "contests_update"
  on public.contests for update
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Admin can delete
create policy "contests_delete"
  on public.contests for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- ── contest_entries ───────────────────────────────────────────────────────────

create table if not exists public.contest_entries (
  id              uuid        primary key default gen_random_uuid(),
  contest_id      uuid        not null references public.contests(id) on delete cascade,
  fantasy_team_id uuid        not null references public.fantasy_teams(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  unique (contest_id, fantasy_team_id)
);

alter table public.contest_entries enable row level security;

create policy "entries_select"
  on public.contest_entries for select
  to authenticated
  using (true);

-- User may join if they own the fantasy_team
create policy "entries_insert"
  on public.contest_entries for insert
  to authenticated
  with check (
    exists (
      select 1 from public.fantasy_teams
      where fantasy_teams.id = fantasy_team_id
        and fantasy_teams.user_id = auth.uid()
    )
  );

-- User may leave (delete own entry); admin can remove any
create policy "entries_delete"
  on public.contest_entries for delete
  to authenticated
  using (
    exists (
      select 1 from public.fantasy_teams
      where fantasy_teams.id = fantasy_team_id
        and fantasy_teams.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- ── Helpful index ─────────────────────────────────────────────────────────────

create index if not exists contest_entries_contest_id_idx on public.contest_entries(contest_id);
create index if not exists contest_entries_team_id_idx    on public.contest_entries(fantasy_team_id);
create index if not exists contests_season_id_idx         on public.contests(season_id);
create index if not exists contests_entry_code_idx        on public.contests(entry_code);
