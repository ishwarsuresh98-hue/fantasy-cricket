-- ── Migration 022: 15-player squads with automatic substitutions ──────────────
--
-- Changes:
--   fantasy_selections  — add is_substitute (bool) + sub_priority (1–4)
--   auto_substitutions  — log of every automatic sub applied
--   resolve_auto_substitutions(p_match_id) — apply auto-subs for a match
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extend fantasy_selections ─────────────────────────────────────────────────
alter table public.fantasy_selections
  add column if not exists is_substitute boolean not null default false,
  add column if not exists sub_priority  integer check (sub_priority between 1 and 4);

-- Starters must have sub_priority = null; subs must have sub_priority 1–4
comment on column public.fantasy_selections.is_substitute is
  'true = substitute bench player; false = starting XI';
comment on column public.fantasy_selections.sub_priority is
  'For subs only: 1 = first off the bench, 4 = last. NULL for starters.';

-- ── auto_substitutions ────────────────────────────────────────────────────────

create table if not exists public.auto_substitutions (
  id              uuid        primary key default gen_random_uuid(),
  fantasy_team_id uuid        not null references public.fantasy_teams(id) on delete cascade,
  match_id        uuid        not null references public.matches(id)        on delete cascade,
  player_out_id   uuid        not null references public.players(id)        on delete cascade,
  player_in_id    uuid        not null references public.players(id)        on delete cascade,
  sub_priority    integer     not null,
  -- Captain/VC cascade fields
  captain_changed    boolean  not null default false,
  vc_changed         boolean  not null default false,
  created_at      timestamptz not null default now()
);

alter table public.auto_substitutions enable row level security;

create policy "auto_substitutions_select_own"
  on public.auto_substitutions for select
  to authenticated
  using (
    fantasy_team_id in (
      select id from public.fantasy_teams where user_id = auth.uid()
    )
  );

create index if not exists auto_subs_team_match_idx on public.auto_substitutions (fantasy_team_id, match_id);
create index if not exists auto_subs_match_idx      on public.auto_substitutions (match_id);

-- ── resolve_auto_substitutions(p_match_id) ───────────────────────────────────
--
-- For every fantasy team in the given match:
--   1. Find starters who have no match_performances row (truly didn't play)
--   2. Replace them in priority order with subs who DID play
--   3. Maintain formation: ≥1 WK, ≥3 batters, ≥1 all-rounder, ≥3 bowlers
--   4. If captain DNP: promote VC to captain (2×), re-assign VC to next eligible
--   5. Log every swap in auto_substitutions
--
-- Call this BEFORE sync_fantasy_points() so the swapped selections earn points.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.resolve_auto_substitutions(p_match_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  r_team       record;
  r_starter    record;
  r_sub        record;
  v_cap_id     uuid;
  v_vc_id      uuid;
  v_cap_played boolean;
  v_vc_played  boolean;

  -- formation counters after proposed swap
  v_wk_count   integer;
  v_bat_count  integer;
  v_ar_count   integer;
  v_bowl_count integer;
begin
  -- Iterate over every fantasy team that has selections for this match
  for r_team in
    select distinct fantasy_team_id
    from   public.fantasy_selections
    where  match_id = p_match_id
  loop

    -- ── Captain / VC for this team ───────────────────────────────────────
    select player_id into v_cap_id
    from   public.fantasy_selections
    where  fantasy_team_id = r_team.fantasy_team_id
      and  match_id        = p_match_id
      and  is_captain      = true
    limit 1;

    select player_id into v_vc_id
    from   public.fantasy_selections
    where  fantasy_team_id = r_team.fantasy_team_id
      and  match_id        = p_match_id
      and  is_vice_captain = true
    limit 1;

    -- Did the captain / VC play?
    select exists(
      select 1 from public.match_performances
      where match_id = p_match_id and player_id = v_cap_id
    ) into v_cap_played;

    select exists(
      select 1 from public.match_performances
      where match_id = p_match_id and player_id = v_vc_id
    ) into v_vc_played;

    -- Captain DNP → promote VC to captain
    if not v_cap_played and v_cap_id is not null then
      if v_vc_played then
        update public.fantasy_selections
        set    is_captain      = true,
               is_vice_captain = false
        where  fantasy_team_id = r_team.fantasy_team_id
          and  match_id        = p_match_id
          and  player_id       = v_vc_id;

        update public.fantasy_selections
        set    is_captain = false
        where  fantasy_team_id = r_team.fantasy_team_id
          and  match_id        = p_match_id
          and  player_id       = v_cap_id;

        -- Try to find a new VC from playing starters
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
            and  exists(
                   select 1 from public.match_performances mp
                   where  mp.match_id = p_match_id and mp.player_id = fs.player_id
                 )
          limit 1
        );
      end if;
    end if;

    -- ── Process each DNP starter ─────────────────────────────────────────
    for r_starter in
      select fs.id as sel_id, fs.player_id, p.role
      from   public.fantasy_selections fs
      join   public.players p on p.id = fs.player_id
      where  fs.fantasy_team_id = r_team.fantasy_team_id
        and  fs.match_id        = p_match_id
        and  fs.is_substitute   = false
        -- DNP = no match_performances row
        and  not exists(
               select 1 from public.match_performances mp
               where  mp.match_id = p_match_id and mp.player_id = fs.player_id
             )
    loop

      -- Try subs in priority order
      for r_sub in
        select fs2.id as sel_id, fs2.player_id, fs2.sub_priority, p2.role
        from   public.fantasy_selections fs2
        join   public.players p2 on p2.id = fs2.player_id
        where  fs2.fantasy_team_id = r_team.fantasy_team_id
          and  fs2.match_id        = p_match_id
          and  fs2.is_substitute   = true
          -- Sub must have played
          and  exists(
                 select 1 from public.match_performances mp
                 where  mp.match_id = p_match_id and mp.player_id = fs2.player_id
               )
        order by fs2.sub_priority asc
      loop

        -- Formation check: would this swap break min requirements?
        -- Current starter formation (excluding the DNP player)
        select
          count(*) filter (where p.role = 'wicket_keeper') - (case when r_starter.role = 'wicket_keeper' then 1 else 0 end)
            + (case when r_sub.role = 'wicket_keeper' then 1 else 0 end),
          count(*) filter (where p.role = 'batsman') - (case when r_starter.role = 'batsman' then 1 else 0 end)
            + (case when r_sub.role = 'batsman' then 1 else 0 end),
          count(*) filter (where p.role = 'all_rounder') - (case when r_starter.role = 'all_rounder' then 1 else 0 end)
            + (case when r_sub.role = 'all_rounder' then 1 else 0 end),
          count(*) filter (where p.role = 'bowler') - (case when r_starter.role = 'bowler' then 1 else 0 end)
            + (case when r_sub.role = 'bowler' then 1 else 0 end)
        into v_wk_count, v_bat_count, v_ar_count, v_bowl_count
        from public.fantasy_selections fs
        join public.players p on p.id = fs.player_id
        where fs.fantasy_team_id = r_team.fantasy_team_id
          and fs.match_id        = p_match_id
          and fs.is_substitute   = false;

        -- Formation is valid if all minimums are still met
        if v_wk_count >= 1 and v_bat_count >= 3 and v_ar_count >= 1 and v_bowl_count >= 3 then
          -- Apply the substitution: swap is_substitute flags
          update public.fantasy_selections
          set    is_substitute = false,
                 sub_priority  = null
          where  id = r_sub.sel_id;

          update public.fantasy_selections
          set    is_substitute = true,
                 sub_priority  = r_sub.sub_priority
          where  id = r_starter.sel_id;

          -- Log it
          insert into public.auto_substitutions
            (fantasy_team_id, match_id, player_out_id, player_in_id, sub_priority)
          values
            (r_team.fantasy_team_id, p_match_id, r_starter.player_id, r_sub.player_id, r_sub.sub_priority);

          exit; -- move to next DNP starter
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

revoke all     on function public.resolve_auto_substitutions(uuid) from public, anon;
grant  execute on function public.resolve_auto_substitutions(uuid) to authenticated;
