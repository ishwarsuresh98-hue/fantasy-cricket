-- ============================================================
-- After each match, reset non-playing players back to 9 credits.
--
-- "Did not play" means the player has no match_performances row
-- for the match, OR has a row where every participation indicator
-- is zero/false (the form upserts rows for the whole squad).
--
-- Playing players continue to get +0.5 / -0.5 based on vs-average
-- performance (unchanged from migration 011).
-- ============================================================

set search_path to public;

create or replace function public.adjust_player_credits(p_match_id uuid)
returns void language plpgsql security definer
set search_path = public
as $$
declare
  v_season_id  uuid;
  v_avg        numeric;
  v_rec        record;
  v_new_credit numeric(5,1);
  v_old_credit numeric(5,1);
begin
  -- Resolve the season for this match (needed to scope non-participant reset).
  select season_id into v_season_id
  from   public.matches
  where  id = p_match_id;

  if v_season_id is null then return; end if;

  -- ── 1. Compute match average over participants only ───────────────────────
  -- "Participant" = any player with at least one non-zero activity flag.
  select avg(base_points) into v_avg
  from   public.match_performances
  where  match_id = p_match_id
    and  (
      did_not_bat = true
      or balls_faced > 0
      or wickets     > 0
      or dot_balls   > 0
      or maidens     > 0
      or catches     > 0
      or stumpings   > 0
      or run_outs    > 0
    );

  -- If no participants found, nothing to do.
  if v_avg is null then return; end if;

  -- ── 2. Adjust credits for players who participated ────────────────────────
  for v_rec in
    select mp.player_id, mp.base_points, pl.price as current_credit
    from   public.match_performances mp
    join   public.players            pl on pl.id = mp.player_id
    where  mp.match_id = p_match_id
      and  (
        mp.did_not_bat = true
        or mp.balls_faced > 0
        or mp.wickets     > 0
        or mp.dot_balls   > 0
        or mp.maidens     > 0
        or mp.catches     > 0
        or mp.stumpings   > 0
        or mp.run_outs    > 0
      )
  loop
    v_old_credit := v_rec.current_credit;

    if    v_rec.base_points > v_avg then v_new_credit := least(11.0,   v_old_credit + 0.5);
    elsif v_rec.base_points < v_avg then v_new_credit := greatest(6.0, v_old_credit - 0.5);
    else                                  v_new_credit := v_old_credit;
    end if;

    insert into public.player_credit_history
      (player_id, match_id, credit_before, credit_after, base_points, match_avg)
    values
      (v_rec.player_id, p_match_id, v_old_credit, v_new_credit, v_rec.base_points, v_avg)
    on conflict (player_id, match_id) do nothing;

    if found then
      update public.players set price = v_new_credit where id = v_rec.player_id;
    end if;
  end loop;

  -- ── 3. Reset non-playing players to 9.0 credits ──────────────────────────
  -- Target: every active player in this season who does NOT have a
  -- participation row for this match.
  for v_rec in
    select pl.id as player_id, pl.price as current_credit
    from   public.players pl
    where  pl.season_id = v_season_id
      and  pl.is_active = true
      and  not exists (
        select 1
        from   public.match_performances mp
        where  mp.match_id  = p_match_id
          and  mp.player_id = pl.id
          and  (
            mp.did_not_bat = true
            or mp.balls_faced > 0
            or mp.wickets     > 0
            or mp.dot_balls   > 0
            or mp.maidens     > 0
            or mp.catches     > 0
            or mp.stumpings   > 0
            or mp.run_outs    > 0
          )
      )
  loop
    v_old_credit := v_rec.current_credit;
    v_new_credit := 9.0;

    insert into public.player_credit_history
      (player_id, match_id, credit_before, credit_after, base_points, match_avg)
    values
      (v_rec.player_id, p_match_id, v_old_credit, v_new_credit, 0, v_avg)
    on conflict (player_id, match_id) do nothing;

    -- Only write the price if the history row was new (idempotent).
    if found then
      update public.players set price = 9.0 where id = v_rec.player_id;
    end if;
  end loop;
end;
$$;
