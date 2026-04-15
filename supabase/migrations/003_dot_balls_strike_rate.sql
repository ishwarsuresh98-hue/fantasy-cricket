-- ============================================================
-- Add dot_balls + maidens columns and update scoring logic
-- ============================================================

set search_path to public;

-- Add new columns to match_performances
alter table public.match_performances
  add column if not exists dot_balls int not null default 0,
  add column if not exists maidens   int not null default 0;

-- Updated compute_base_points with strike rate + dot ball scoring
create or replace function public.compute_base_points(
  p_runs int, p_balls int, p_fours int, p_sixes int, p_did_not_bat bool,
  p_wickets int, p_catches int, p_stumpings int, p_run_outs int,
  p_dot_balls int default 0, p_maidens int default 0
) returns numeric language plpgsql as $$
declare
  pts  numeric := 0;
  v_sr numeric;
begin
  -- Batting
  if not p_did_not_bat then
    pts := pts + p_runs + p_fours + (p_sixes * 2);
    if    p_runs >= 100 then pts := pts + 16;
    elsif p_runs >= 50  then pts := pts + 8;
    end if;
    if p_runs = 0 and p_balls > 0 then pts := pts - 2; end if;

    -- Strike rate (minimum 10 balls faced)
    if p_balls >= 10 then
      v_sr := (p_runs::numeric / p_balls) * 100;
      if    v_sr >= 150 then pts := pts + 3;
      elsif v_sr >= 125 then pts := pts + 2;
      elsif v_sr >= 100 then pts := pts + 1;
      elsif v_sr >=  75 then pts := pts + 0;
      else                   pts := pts - 2;
      end if;
    end if;
  end if;

  -- Bowling
  pts := pts + (p_wickets * 25);
  if    p_wickets >= 5 then pts := pts + 16;
  elsif p_wickets >= 4 then pts := pts + 8;
  elsif p_wickets >= 3 then pts := pts + 4;
  end if;

  -- Dot balls + maidens
  pts := pts + p_dot_balls + (p_maidens * 8);

  -- Fielding
  pts := pts + (p_catches * 8) + (p_stumpings * 12) + (p_run_outs * 6);

  return pts;
end;
$$;

-- Updated trigger that passes the two new columns
create or replace function public.after_performance_change()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_base          numeric;
  v_player_role   text;
  v_sel           record;
  v_booster_type  text;
  v_booster_pid   uuid;
  v_base_mult     numeric;
  v_booster_mult  numeric;
begin
  v_base := public.compute_base_points(
    new.runs_scored, new.balls_faced, new.fours, new.sixes, new.did_not_bat,
    new.wickets, new.catches, new.stumpings, new.run_outs,
    new.dot_balls, new.maidens
  );
  new.base_points := v_base;

  select role into v_player_role
  from public.players where id = new.player_id;

  for v_sel in
    select fs.id, fs.fantasy_team_id, fs.is_captain, fs.is_vice_captain
    from public.fantasy_selections fs
    where fs.match_id  = new.match_id
      and fs.player_id = new.player_id
  loop
    if v_sel.is_captain         then v_base_mult := 2;
    elsif v_sel.is_vice_captain then v_base_mult := 1.5;
    else                             v_base_mult := 1;
    end if;

    v_booster_mult := 1;
    v_booster_type := null;
    v_booster_pid  := null;

    select tb.booster_type, tb.selected_player_id
    into   v_booster_type,  v_booster_pid
    from   public.team_boosters tb
    where  tb.fantasy_team_id = v_sel.fantasy_team_id
      and  tb.match_id        = new.match_id
    limit 1;

    if v_booster_type is not null then
      case v_booster_type
        when 'double_power'   then v_booster_mult := 2;
        when 'batting_surge'  then if v_player_role in ('batsman','all_rounder') then v_booster_mult := 2; end if;
        when 'bowling_surge'  then if v_player_role in ('bowler','all_rounder')  then v_booster_mult := 2; end if;
        when 'keeping_surge'  then if v_player_role  = 'wicket_keeper'           then v_booster_mult := 2; end if;
        when 'triple_captain' then if v_booster_pid  = new.player_id             then v_base_mult := 3; v_booster_mult := 1; end if;
        else null;
      end case;
    end if;

    update public.fantasy_selections
    set    points_earned = v_base * v_base_mult * v_booster_mult
    where  id = v_sel.id;

    update public.fantasy_teams
    set    total_points = (
             select coalesce(sum(points_earned), 0)
             from   public.fantasy_selections
             where  fantasy_team_id = v_sel.fantasy_team_id
           )
    where  id = v_sel.fantasy_team_id;

  end loop;
  return new;
end;
$$;

drop trigger if exists trg_performance_scoring on public.match_performances;
create trigger trg_performance_scoring
  before insert or update on public.match_performances
  for each row execute procedure public.after_performance_change();
