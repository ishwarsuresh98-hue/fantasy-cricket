-- ── Migration 024: Open League contest type ───────────────────────────────────
--
-- Changes:
--   contests.max_entries — make nullable (null = unlimited)
--   contests.final_prize_pool — store the frozen pot after gameweek lock
--   contests.type — add 'open_league' to allowed values
--   freeze_open_league_contest(contest_id) — call at gameweek lock
-- ─────────────────────────────────────────────────────────────────────────────

-- Allow max_entries to be null (unlimited)
alter table public.contests
  alter column max_entries drop not null;

-- final_prize_pool is set when the contest is frozen at gameweek lock
alter table public.contests
  add column if not exists final_prize_pool numeric;

-- Extend the type check to include open_league
-- (Drop and re-add the constraint since Postgres doesn't support ALTER CHECK inline)
alter table public.contests drop constraint if exists contests_type_check;
alter table public.contests
  add constraint contests_type_check
  check (type in ('public','private','head_to_head','small_league','mega','winner_takes_all','practice','open_league'));

-- ── freeze_open_league_contest ────────────────────────────────────────────────
-- Call this when the gameweek locks.
-- Computes final_prize_pool = entry_count × entry_fee × 0.85
-- Sets status = 'locked' so no more entries are accepted.

create or replace function public.freeze_open_league_contest(p_contest_id uuid)
returns numeric   -- returns the frozen prize pool
language plpgsql
security definer
as $$
declare
  v_entry_count  integer;
  v_entry_fee    numeric;
  v_platform_fee numeric;
  v_prize_pool   numeric;
begin
  select
    count(ce.id),
    c.entry_fee,
    coalesce(c.platform_fee_pct, 15)
  into v_entry_count, v_entry_fee, v_platform_fee
  from public.contests c
  left join public.contest_entries ce on ce.contest_id = c.id
  where c.id = p_contest_id
  group by c.entry_fee, c.platform_fee_pct;

  v_prize_pool := round(v_entry_count * v_entry_fee * (1 - v_platform_fee / 100.0), 2);

  update public.contests
  set    final_prize_pool = v_prize_pool,
         status           = 'locked',
         max_entries      = v_entry_count   -- freeze capacity at actual entry count
  where  id = p_contest_id;

  return v_prize_pool;
end;
$$;

revoke all     on function public.freeze_open_league_contest(uuid) from public, anon;
grant  execute on function public.freeze_open_league_contest(uuid) to authenticated;
