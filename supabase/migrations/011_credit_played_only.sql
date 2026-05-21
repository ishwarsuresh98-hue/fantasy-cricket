-- ============================================================
-- Fix: only adjust credits for players who actually participated
-- in the match.
--
-- StatsForm upserts a match_performances row for every player in
-- the squad (including non-participants with all-zero stats and
-- did_not_bat = false).  The previous function treated those rows
-- as "0-point performances" and reduced their credits.
--
-- A player "played" when ANY of the following is true:
--   • did_not_bat  = true   (explicitly marked DNB — still selected)
--   • balls_faced  > 0      (batted)
--   • wickets / dot_balls / maidens > 0  (bowled)
--   • catches / stumpings / run_outs > 0 (fielded)
--
-- Both the match average and the credit-adjustment loop now use
-- this same filter so non-participants are completely ignored.
-- ============================================================

set search_path to public;

create or replace function public.adjust_player_credits(p_match_id uuid)
returns void language plpgsql security definer
set search_path = public
as $$
declare
  v_avg        numeric;
  v_rec        record;
  v_new_credit numeric(5,1);
  v_old_credit numeric(5,1);
begin
  -- Average is computed only over players who actually participated.
  select avg(base_points) into v_avg
  from   public.match_performances
  where  match_id = p_match_id
    and  (
      did_not_bat  = true
      or balls_faced  > 0
      or wickets      > 0
      or dot_balls    > 0
      or maidens      > 0
      or catches      > 0
      or stumpings    > 0
      or run_outs     > 0
    );

  if v_avg is null then return; end if;

  -- Loop only over participants (same filter as the average above).
  for v_rec in
    select mp.player_id, mp.base_points, pl.price as current_credit
    from   public.match_performances mp
    join   public.players            pl on pl.id = mp.player_id
    where  mp.match_id = p_match_id
      and  (
        mp.did_not_bat  = true
        or mp.balls_faced  > 0
        or mp.wickets      > 0
        or mp.dot_balls    > 0
        or mp.maidens      > 0
        or mp.catches      > 0
        or mp.stumpings    > 0
        or mp.run_outs     > 0
      )
  loop
    v_old_credit := v_rec.current_credit;

    if    v_rec.base_points > v_avg then v_new_credit := least(11.0,    v_old_credit + 0.5);
    elsif v_rec.base_points < v_avg then v_new_credit := greatest(6.0,  v_old_credit - 0.5);
    else                                  v_new_credit := v_old_credit;
    end if;

    -- Insert history row; skip if already processed for this match (idempotent).
    insert into public.player_credit_history
      (player_id, match_id, credit_before, credit_after, base_points, match_avg)
    values
      (v_rec.player_id, p_match_id, v_old_credit, v_new_credit, v_rec.base_points, v_avg)
    on conflict (player_id, match_id) do nothing;

    -- FOUND is true only when the INSERT wrote a new row (not on conflict).
    if found then
      update public.players set price = v_new_credit where id = v_rec.player_id;
    end if;
  end loop;
end;
$$;
