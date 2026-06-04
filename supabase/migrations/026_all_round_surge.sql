-- ── Migration 026: All-Round Surge booster + fix Batting/Bowling Surge roles ──
--
-- Changes:
--   1. Extend team_boosters.booster_type check to include 'all_round_surge'
--   2. Rewrite sync_fantasy_points() with corrected multiplier logic:
--        batting_surge  → batsman only     (was: batsman + all_rounder)
--        bowling_surge  → bowler only      (was: bowler  + all_rounder)
--        all_round_surge → all_rounder only (new)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Update the check constraint on team_boosters ──────────────────────────

alter table public.team_boosters
  drop constraint if exists team_boosters_booster_type_check;

alter table public.team_boosters
  add constraint team_boosters_booster_type_check
  check (booster_type in (
    'batting_surge', 'keeping_surge', 'bowling_surge', 'all_round_surge',
    'free_hit', 'triple_captain', 'mega_transfer', 'double_power',
    'score_freeze', 'underdog'
  ));

-- ── 2. Rewrite sync_fantasy_points() ─────────────────────────────────────────
--
-- Multiplier table (booster_mult):
--   double_power                          → 2.0  (all players)
--   batting_surge   + role = batsman      → 2.0
--   bowling_surge   + role = bowler       → 2.0
--   keeping_surge   + role = wicket_keeper → 2.0
--   all_round_surge + role = all_rounder  → 2.0
--   all others                            → 1.0

create or replace function public.sync_fantasy_points()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin

  -- ── Phase 0a: propagate is_captain within each gameweek ─────────────────

  update public.fantasy_selections fs
  set    is_captain = true
  from (
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
    and  fs.is_captain = false;

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

  update public.fantasy_selections
  set    points_earned = 0
  where  id is not null;

  -- ── Phase 2: recalculate points_earned with all multipliers ─────────────
  --
  -- points_earned = base_points × base_mult × booster_mult
  --
  --   base_mult:
  --     triple_captain targeting this player  → 3.0
  --     is_captain = true                     → 2.0
  --     is_vice_captain = true                → 1.5
  --     otherwise                             → 1.0
  --
  --   booster_mult:
  --     double_power                          → 2.0
  --     batting_surge   + batsman             → 2.0
  --     bowling_surge   + bowler              → 2.0
  --     keeping_surge   + wicket_keeper       → 2.0
  --     all_round_surge + all_rounder         → 2.0
  --     all others                            → 1.0

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
           and p.role = 'batsman'
          then 2.0
          when tb.booster_type = 'bowling_surge'
           and p.role = 'bowler'
          then 2.0
          when tb.booster_type = 'keeping_surge'
           and p.role = 'wicket_keeper'
          then 2.0
          when tb.booster_type = 'all_round_surge'
           and p.role = 'all_rounder'
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

revoke all     on function public.sync_fantasy_points() from public, anon;
grant  execute on function public.sync_fantasy_points() to authenticated;
