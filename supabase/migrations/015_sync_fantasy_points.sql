-- ============================================================
-- Migration 015: Define sync_fantasy_points()
-- ============================================================
--
-- StatsForm.tsx calls supabase.rpc('sync_fantasy_points') after
-- every stats save but this function was never defined — it has
-- been silently failing.
--
-- This function re-applies captain / VC / booster multipliers to
-- fantasy_selections.points_earned and rebuilds fantasy_teams.total_points.
-- It does NOT touch match_performances.base_points — that is already
-- handled by the trg_performance_scoring trigger when stats are saved.
--
-- The function intentionally does a FULL re-sweep (not per-match) so
-- that late-set captain selections and booster activations are always
-- reflected correctly, regardless of the order in which data was entered.
--
-- Multiplier rules (identical to after_performance_change trigger):
--
--   base_mult:
--     triple_captain booster targeting this player  →  3.0
--     is_captain                                    →  2.0
--     is_vice_captain                               →  1.5
--     otherwise                                     →  1.0
--
--   booster_mult:
--     double_power                                  →  2.0
--     batting_surge  + batsman / all_rounder        →  2.0
--     bowling_surge  + bowler  / all_rounder        →  2.0
--     keeping_surge  + wicket_keeper                →  2.0
--     all other booster types                       →  1.0
--
--   points_earned  =  base_points  ×  base_mult  ×  booster_mult
--
-- Safe to re-run: idempotent UPDATEs.
-- ============================================================

set search_path to public;

create or replace function public.sync_fantasy_points()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin

  -- ── Phase 1: zero out all selections ───────────────────────────────────────
  -- Ensures players selected but absent (no matching match_performance) score 0.
  update public.fantasy_selections
  set    points_earned = 0
  where  id is not null;

  -- ── Phase 2: re-apply multipliers to selections with a performance row ─────
  update public.fantasy_selections fs
  set    points_earned = calc.pts
  from (
    select
      fs2.id,

      mp.base_points

      -- Captain / VC / triple-captain base multiplier
      * case
          when tb.booster_type = 'triple_captain'
           and tb.selected_player_id = fs2.player_id
          then 3.0
          when fs2.is_captain      then 2.0
          when fs2.is_vice_captain then 1.5
          else                          1.0
        end

      -- Booster multiplier
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

          else 1.0  -- triple_captain (base_mult handles it), free_hit, etc.
        end

      as pts

    from  public.fantasy_selections  fs2

    -- Must have a performance row to earn points
    join  public.match_performances  mp
      on  mp.match_id  = fs2.match_id
      and mp.player_id = fs2.player_id

    -- Need role for booster role-gating
    join  public.players             p
      on  p.id = fs2.player_id

    -- One active booster per team per match
    left join lateral (
      select booster_type, selected_player_id
      from   public.team_boosters
      where  fantasy_team_id = fs2.fantasy_team_id
        and  match_id        = fs2.match_id
      limit  1
    ) tb on true

  ) calc
  where fs.id = calc.id;

  -- ── Phase 3: rebuild each team's total_points ──────────────────────────────
  update public.fantasy_teams ft
  set    total_points = (
    select coalesce(sum(fs.points_earned), 0)
    from   public.fantasy_selections fs
    where  fs.fantasy_team_id = ft.id
  )
  where id is not null;

end;
$$;

-- Only authenticated users (admins in practice) can call this
revoke all     on function public.sync_fantasy_points() from public, anon;
grant  execute on function public.sync_fantasy_points() to authenticated;
