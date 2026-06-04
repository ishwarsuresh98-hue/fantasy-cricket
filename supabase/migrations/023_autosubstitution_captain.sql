-- ── Migration 023: Fix auto-sub captain/VC inheritance ────────────────────────
--
-- New behaviour:
--   1. If the captain DNP and a valid sub is available → sub replaces the captain
--      AND the sub inherits the captaincy (2×). Log captain_changed = true.
--   2. If the VC DNP and a valid sub is available → sub replaces the VC
--      AND the sub inherits the VC (1.5×). Log vc_changed = true.
--   3. Fallback (captain DNP, no eligible sub) → VC is promoted to captain,
--      next eligible playing starter gets VC.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.resolve_auto_substitutions(p_match_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  r_team        record;
  r_starter     record;
  r_sub         record;
  v_cap_id      uuid;
  v_vc_id       uuid;
  v_cap_played  boolean;
  v_vc_played   boolean;
  v_cap_sel_id  uuid;
  v_vc_sel_id   uuid;

  v_sub_found   boolean;
  v_wk_count    integer;
  v_bat_count   integer;
  v_ar_count    integer;
  v_bowl_count  integer;
begin
  for r_team in
    select distinct fantasy_team_id
    from   public.fantasy_selections
    where  match_id = p_match_id
  loop
    -- ── Identify captain / VC ───────────────────────────────────────────
    select id, player_id into v_cap_sel_id, v_cap_id
    from   public.fantasy_selections
    where  fantasy_team_id = r_team.fantasy_team_id
      and  match_id        = p_match_id
      and  is_captain      = true
    limit 1;

    select id, player_id into v_vc_sel_id, v_vc_id
    from   public.fantasy_selections
    where  fantasy_team_id = r_team.fantasy_team_id
      and  match_id        = p_match_id
      and  is_vice_captain = true
    limit 1;

    -- Did they play?
    select exists(
      select 1 from public.match_performances
      where match_id = p_match_id and player_id = v_cap_id
    ) into v_cap_played;

    select exists(
      select 1 from public.match_performances
      where match_id = p_match_id and player_id = v_vc_id
    ) into v_vc_played;

    -- ── Process ALL DNP starters (including cap/VC) ──────────────────────
    -- We iterate starters ordered so that the captain's slot is processed
    -- first (is_captain desc), then VC, then the rest.
    for r_starter in
      select fs.id as sel_id,
             fs.player_id,
             fs.is_captain,
             fs.is_vice_captain,
             p.role
      from   public.fantasy_selections fs
      join   public.players p on p.id = fs.player_id
      where  fs.fantasy_team_id = r_team.fantasy_team_id
        and  fs.match_id        = p_match_id
        and  fs.is_substitute   = false
        and  not exists(
               select 1 from public.match_performances mp
               where  mp.match_id = p_match_id and mp.player_id = fs.player_id
             )
      order by fs.is_captain desc, fs.is_vice_captain desc
    loop
      v_sub_found := false;

      -- Try subs in priority order
      for r_sub in
        select fs2.id as sel_id,
               fs2.player_id,
               fs2.sub_priority,
               p2.role
        from   public.fantasy_selections fs2
        join   public.players p2 on p2.id = fs2.player_id
        where  fs2.fantasy_team_id = r_team.fantasy_team_id
          and  fs2.match_id        = p_match_id
          and  fs2.is_substitute   = true
          and  exists(
                 select 1 from public.match_performances mp
                 where  mp.match_id = p_match_id and mp.player_id = fs2.player_id
               )
        order by fs2.sub_priority asc
      loop
        -- Formation check after proposed swap
        select
          count(*) filter (where p.role = 'wicket_keeper')
            - (case when r_starter.role = 'wicket_keeper' then 1 else 0 end)
            + (case when r_sub.role     = 'wicket_keeper' then 1 else 0 end),
          count(*) filter (where p.role = 'batsman')
            - (case when r_starter.role = 'batsman' then 1 else 0 end)
            + (case when r_sub.role     = 'batsman' then 1 else 0 end),
          count(*) filter (where p.role = 'all_rounder')
            - (case when r_starter.role = 'all_rounder' then 1 else 0 end)
            + (case when r_sub.role     = 'all_rounder' then 1 else 0 end),
          count(*) filter (where p.role = 'bowler')
            - (case when r_starter.role = 'bowler' then 1 else 0 end)
            + (case when r_sub.role     = 'bowler' then 1 else 0 end)
        into v_wk_count, v_bat_count, v_ar_count, v_bowl_count
        from public.fantasy_selections fs
        join public.players p on p.id = fs.player_id
        where fs.fantasy_team_id = r_team.fantasy_team_id
          and fs.match_id        = p_match_id
          and fs.is_substitute   = false;

        if v_wk_count >= 1 and v_bat_count >= 3 and v_ar_count >= 1 and v_bowl_count >= 3 then
          -- Apply swap: sub comes in as a starter, DNP player goes to bench
          update public.fantasy_selections
          set    is_substitute = false,
                 sub_priority  = null
          where  id = r_sub.sel_id;

          update public.fantasy_selections
          set    is_substitute = true,
                 sub_priority  = r_sub.sub_priority
          where  id = r_starter.sel_id;

          -- ── Captain/VC inheritance ─────────────────────────────────────
          -- If the outgoing player was captain → incoming sub inherits captaincy
          -- If the outgoing player was VC       → incoming sub inherits VC
          if r_starter.is_captain then
            update public.fantasy_selections
            set    is_captain = true
            where  id = r_sub.sel_id;

            update public.fantasy_selections
            set    is_captain = false
            where  id = r_starter.sel_id;
          end if;

          if r_starter.is_vice_captain then
            update public.fantasy_selections
            set    is_vice_captain = true
            where  id = r_sub.sel_id;

            update public.fantasy_selections
            set    is_vice_captain = false
            where  id = r_starter.sel_id;
          end if;

          -- Log the substitution
          insert into public.auto_substitutions
            (fantasy_team_id, match_id, player_out_id, player_in_id,
             sub_priority, captain_changed, vc_changed)
          values
            (r_team.fantasy_team_id, p_match_id,
             r_starter.player_id, r_sub.player_id,
             r_sub.sub_priority,
             r_starter.is_captain,
             r_starter.is_vice_captain);

          v_sub_found := true;
          exit; -- move to next DNP starter
        end if;
      end loop; -- subs loop

      -- ── Fallback: captain DNP, no eligible sub ──────────────────────────
      -- Promote VC to captain, assign VC to next eligible playing starter.
      if not v_sub_found and r_starter.is_captain and v_vc_played then
        -- Promote VC → captain
        update public.fantasy_selections
        set    is_captain      = true,
               is_vice_captain = false
        where  fantasy_team_id = r_team.fantasy_team_id
          and  match_id        = p_match_id
          and  player_id       = v_vc_id;

        update public.fantasy_selections
        set    is_captain = false
        where  id = r_starter.sel_id;

        -- Assign new VC to highest-scoring eligible playing starter
        update public.fantasy_selections
        set    is_vice_captain = true
        where  id = (
          select fs.id
          from   public.fantasy_selections fs
          where  fs.fantasy_team_id = r_team.fantasy_team_id
            and  fs.match_id        = p_match_id
            and  fs.is_substitute   = false
            and  fs.player_id      != v_vc_id
            and  fs.player_id      != v_cap_id
            and  fs.is_captain      = false
            and  exists(
                   select 1 from public.match_performances mp
                   where  mp.match_id = p_match_id and mp.player_id = fs.player_id
                 )
          limit 1
        );
      end if;
    end loop; -- starters loop
  end loop; -- teams loop
end;
$$;

revoke all     on function public.resolve_auto_substitutions(uuid) from public, anon;
grant  execute on function public.resolve_auto_substitutions(uuid) to authenticated;
