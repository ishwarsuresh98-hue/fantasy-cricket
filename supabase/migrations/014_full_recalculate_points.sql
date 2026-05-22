-- ============================================================
-- Migration 014: Full recalculation of all fantasy points from scratch
-- ============================================================
--
-- Runs three explicit phases without relying on trigger side-effects:
--
--   Phase 1 — Refresh base_points on every match_performance row using
--              the current compute_base_points() formula (includes SR bonus,
--              dot balls, maidens).  The scoring trigger is disabled during
--              this phase so it doesn't cascade into fantasy_selections yet
--              (we do that ourselves in phase 2, more reliably).
--
--   Phase 2 — Recalculate fantasy_selections.points_earned.
--              First zero out ALL rows (clean slate — handles players who
--              appear in a selection but have no performance record, e.g.
--              absent players, deleted stats).  Then set the correct value
--              for every selection that has a matching match_performance,
--              applying captain (2×) / vice-captain (1.5×) / booster
--              multipliers exactly as the trigger does.
--
--   Phase 3 — Rebuild fantasy_teams.total_points by summing their
--              fantasy_selections.points_earned from scratch.
--
-- Gameweek note: gameweeks are a front-end concept only (all matches on
-- the same calendar date = one GW).  No DB schema change is needed; the
-- leaderboard page groups by match_date at render time.
--
-- Safe to re-run: all three phases are idempotent UPDATEs.
-- ============================================================

set search_path to public;

-- ══════════════════════════════════════════════════════════════
-- PHASE 1 — Refresh base_points on every match_performance
-- ══════════════════════════════════════════════════════════════
--
-- Disable the scoring trigger so it doesn't cascade into
-- fantasy_selections during the performance sweep (phase 2 handles that).

alter table public.match_performances
  disable trigger trg_performance_scoring;

update public.match_performances
set    base_points = public.compute_base_points(
         runs_scored,
         balls_faced,
         fours,
         sixes,
         did_not_bat,
         wickets,
         catches,
         stumpings,
         run_outs,
         dot_balls,
         maidens
       )
where  id is not null;

alter table public.match_performances
  enable trigger trg_performance_scoring;


-- ══════════════════════════════════════════════════════════════
-- PHASE 2 — Recalculate fantasy_selections.points_earned
-- ══════════════════════════════════════════════════════════════

-- 2a. Clean slate — ensures players with no performance row earn 0 pts.
update public.fantasy_selections
set    points_earned = 0
where  id is not null;

-- 2b. Set correct points for every selection that has a matching performance.
--
-- Multiplier rules (matching the after_performance_change trigger exactly):
--
--   base_mult:
--     triple_captain booster targeting this player  →  3.0
--     is_captain                                    →  2.0
--     is_vice_captain                               →  1.5
--     otherwise                                     →  1.0
--
--   booster_mult:
--     double_power                                  →  2.0
--     batting_surge  + batsman/all_rounder          →  2.0
--     bowling_surge  + bowler/all_rounder           →  2.0
--     keeping_surge  + wicket_keeper                →  2.0
--     triple_captain (already handled in base_mult) →  1.0
--     free_hit / score_freeze / underdog / other    →  1.0
--
--   points_earned = base_points × base_mult × booster_mult

update public.fantasy_selections fs
set    points_earned = calc.pts
from (
  select
    fs2.id,

    mp.base_points
    -- ── Captain / VC base multiplier ────────────────────────────────────
    * case
        when tb.booster_type = 'triple_captain'
         and tb.selected_player_id = fs2.player_id
        then 3.0                       -- triple captain overrides normal 2×
        when fs2.is_captain      then 2.0
        when fs2.is_vice_captain then 1.5
        else                          1.0
      end

    -- ── Booster multiplier ───────────────────────────────────────────────
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

        else 1.0  -- triple_captain, free_hit, score_freeze, underdog, etc.
      end

    as pts

  from  public.fantasy_selections  fs2
  join  public.match_performances  mp
    on  mp.match_id  = fs2.match_id
    and mp.player_id = fs2.player_id
  join  public.players             p
    on  p.id = fs2.player_id

  -- One booster per team per match (same LIMIT 1 logic as the trigger)
  left join lateral (
    select booster_type, selected_player_id
    from   public.team_boosters
    where  fantasy_team_id = fs2.fantasy_team_id
      and  match_id        = fs2.match_id
    limit  1
  ) tb on true

) calc
where fs.id = calc.id;


-- ══════════════════════════════════════════════════════════════
-- PHASE 3 — Rebuild fantasy_teams.total_points from scratch
-- ══════════════════════════════════════════════════════════════
--
-- Sum every fantasy_selection.points_earned for the team, regardless
-- of match status.  This is a full rebuild, not an incremental update.

update public.fantasy_teams ft
set    total_points = (
  select coalesce(sum(fs.points_earned), 0)
  from   public.fantasy_selections fs
  where  fs.fantasy_team_id = ft.id
)
where  id is not null;


-- ══════════════════════════════════════════════════════════════
-- Update recalculate_all_points() to use the same explicit logic
-- so the admin "Recalculate" button also does a full rebuild.
-- ══════════════════════════════════════════════════════════════

create or replace function public.recalculate_all_points()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perf_count int;
begin
  -- Phase 1: refresh base_points (trigger disabled to avoid double-work)
  alter table public.match_performances
    disable trigger trg_performance_scoring;

  update public.match_performances
  set    base_points = public.compute_base_points(
           runs_scored, balls_faced, fours, sixes, did_not_bat,
           wickets, catches, stumpings, run_outs, dot_balls, maidens
         )
  where  id is not null;

  get diagnostics v_perf_count = row_count;

  alter table public.match_performances
    enable trigger trg_performance_scoring;

  -- Phase 2: zero out then re-apply selection points
  update public.fantasy_selections set points_earned = 0 where id is not null;

  update public.fantasy_selections fs
  set    points_earned = calc.pts
  from (
    select
      fs2.id,
      mp.base_points
      * case
          when tb.booster_type = 'triple_captain'
           and tb.selected_player_id = fs2.player_id then 3.0
          when fs2.is_captain      then 2.0
          when fs2.is_vice_captain then 1.5
          else                          1.0
        end
      * case
          when tb.booster_type = 'double_power'                                          then 2.0
          when tb.booster_type = 'batting_surge' and p.role in ('batsman','all_rounder') then 2.0
          when tb.booster_type = 'bowling_surge' and p.role in ('bowler','all_rounder')  then 2.0
          when tb.booster_type = 'keeping_surge' and p.role = 'wicket_keeper'            then 2.0
          else 1.0
        end as pts
    from  public.fantasy_selections  fs2
    join  public.match_performances  mp on mp.match_id = fs2.match_id and mp.player_id = fs2.player_id
    join  public.players             p  on p.id = fs2.player_id
    left join lateral (
      select booster_type, selected_player_id
      from   public.team_boosters
      where  fantasy_team_id = fs2.fantasy_team_id and match_id = fs2.match_id
      limit  1
    ) tb on true
  ) calc
  where fs.id = calc.id;

  -- Phase 3: rebuild team totals
  update public.fantasy_teams ft
  set    total_points = (
    select coalesce(sum(fs.points_earned), 0)
    from   public.fantasy_selections fs
    where  fs.fantasy_team_id = ft.id
  )
  where id is not null;

  return v_perf_count;
end;
$$;

revoke all    on function public.recalculate_all_points() from public, anon;
grant  execute on function public.recalculate_all_points() to authenticated;
