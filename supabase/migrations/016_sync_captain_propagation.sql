-- ============================================================
-- Migration 016: Fix sync_fantasy_points() — C/VC propagation
-- ============================================================
--
-- PROBLEM
-- -------
-- Gameweeks are defined as all matches on the same calendar date
-- (UTC).  There is no gameweek_number column on matches — it is a
-- front-end concept computed from match_date.
--
-- When a user sets is_captain = true for a player on match A, that
-- flag lives only on the fantasy_selections row keyed to match A.
-- If match B is played on the same date (same gameweek), the
-- auto-created selection row for match B has is_captain = false,
-- so the captain multiplier (2×) is never applied for match B.
--
-- FIX
-- ---
-- Add a Phase 0 to sync_fantasy_points() that propagates is_captain
-- and is_vice_captain across every selection row for the same
-- (fantasy_team_id, player_id) within the same calendar date before
-- the points calculation runs.
--
-- Grouping rule: same gameweek = same UTC calendar date on matches.match_date
--
-- The propagation is purely additive — it only sets flags to true,
-- never clears an existing true.  The assumption (safe for a club
-- league) is that a team nominates exactly one captain and one VC
-- per gameweek, and that nomination is consistent across all
-- same-day matches.
--
-- Full function phases
-- --------------------
--   Phase 0a  Propagate is_captain  across same-GW selection rows
--   Phase 0b  Propagate is_vice_captain across same-GW selection rows
--   Phase 1   Zero out points_earned (clean slate)
--   Phase 2   Re-apply base × captain_mult × booster_mult
--   Phase 3   Rebuild fantasy_teams.total_points
--
-- Safe to re-run: all phases are idempotent.
-- ============================================================

set search_path to public;

create or replace function public.sync_fantasy_points()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin

  -- ── Phase 0a: propagate is_captain within each gameweek ─────────────────
  --
  -- For every (fantasy_team_id, player_id, gw_date) where at least one
  -- selection row already has is_captain = true, set is_captain = true on
  -- ALL other selection rows for that same combination.
  --
  -- Gameweek date = date_trunc('day', match_date AT TIME ZONE 'UTC').

  update public.fantasy_selections fs
  set    is_captain = true
  from (
    -- Authoritative source: rows that already carry the captain flag
    select distinct
      fs2.fantasy_team_id,
      fs2.player_id,
      date_trunc('day', m2.match_date at time zone 'UTC') as gw_date
    from   public.fantasy_selections fs2
    join   public.matches            m2 on m2.id = fs2.match_id
    where  fs2.is_captain = true
  ) src
  join public.matches m on m.id = fs.match_id
  where  fs.fantasy_team_id = src.fantasy_team_id
    and  fs.player_id       = src.player_id
    and  date_trunc('day', m.match_date at time zone 'UTC') = src.gw_date
    and  fs.is_captain = false;  -- only touch rows that don't already have it

  -- ── Phase 0b: propagate is_vice_captain within each gameweek ────────────

  update public.fantasy_selections fs
  set    is_vice_captain = true
  from (
    select distinct
      fs2.fantasy_team_id,
      fs2.player_id,
      date_trunc('day', m2.match_date at time zone 'UTC') as gw_date
    from   public.fantasy_selections fs2
    join   public.matches            m2 on m2.id = fs2.match_id
    where  fs2.is_vice_captain = true
  ) src
  join public.matches m on m.id = fs.match_id
  where  fs.fantasy_team_id = src.fantasy_team_id
    and  fs.player_id       = src.player_id
    and  date_trunc('day', m.match_date at time zone 'UTC') = src.gw_date
    and  fs.is_vice_captain = false;

  -- ── Phase 1: zero out all points_earned ─────────────────────────────────
  --
  -- Clean slate: players selected but absent (no matching match_performance)
  -- correctly earn 0 pts rather than keeping a stale value.

  update public.fantasy_selections
  set    points_earned = 0
  where  id is not null;

  -- ── Phase 2: recalculate points_earned with all multipliers ─────────────
  --
  -- points_earned = base_points × base_mult × booster_mult
  --
  --   base_mult:
  --     triple_captain booster targeting this player  → 3.0
  --     is_captain = true                             → 2.0
  --     is_vice_captain = true                        → 1.5
  --     otherwise                                     → 1.0
  --
  --   booster_mult:
  --     double_power                                  → 2.0
  --     batting_surge  + batsman / all_rounder        → 2.0
  --     bowling_surge  + bowler  / all_rounder        → 2.0
  --     keeping_surge  + wicket_keeper                → 2.0
  --     all others (incl. triple_captain, free_hit)   → 1.0

  update public.fantasy_selections fs
  set    points_earned = calc.pts
  from (
    select
      fs2.id,

      mp.base_points

      * case
          when tb.booster_type = 'triple_captain'
           and tb.selected_player_id = fs2.player_id then 3.0
          when fs2.is_captain                        then 2.0
          when fs2.is_vice_captain                   then 1.5
          else                                            1.0
        end

      * case
          when tb.booster_type = 'double_power'
          then 2.0
          when tb.booster_type = 'batting_surge'
           and p.role in ('batsman', 'all_rounder')
          then 2.0
          when tb.booster_type = 'bowling_surge'
           and p.role in ('bowler', 'all_rounder')
          then 2.0
          when tb.booster_type = 'keeping_surge'
           and p.role = 'wicket_keeper'
          then 2.0
          else 1.0
        end

      as pts

    from  public.fantasy_selections fs2
    join  public.match_performances mp
      on  mp.match_id  = fs2.match_id
      and mp.player_id = fs2.player_id
    join  public.players p
      on  p.id = fs2.player_id
    left join lateral (
      select booster_type, selected_player_id
      from   public.team_boosters
      where  fantasy_team_id = fs2.fantasy_team_id
        and  match_id        = fs2.match_id
      limit  1
    ) tb on true

  ) calc
  where fs.id = calc.id;

  -- ── Phase 3: rebuild fantasy_teams.total_points ──────────────────────────

  update public.fantasy_teams ft
  set    total_points = (
    select coalesce(sum(fs.points_earned), 0)
    from   public.fantasy_selections fs
    where  fs.fantasy_team_id = ft.id
  )
  where id is not null;

end;
$$;

-- Permissions unchanged: authenticated users only
revoke all     on function public.sync_fantasy_points() from public, anon;
grant  execute on function public.sync_fantasy_points() to authenticated;
