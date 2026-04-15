-- ============================================================
-- Fantasy Cricket League — Boosters System
-- ============================================================

set search_path to public;

-- ── Step 1: Ensure core tables have primary keys ──────────
-- (needed if 001_initial.sql was never run or ran on pre-existing tables)

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.matches'::regclass and contype = 'p'
  ) then
    alter table public.matches add primary key (id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.fantasy_teams'::regclass and contype = 'p'
  ) then
    alter table public.fantasy_teams add primary key (id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.players'::regclass and contype = 'p'
  ) then
    alter table public.players add primary key (id);
  end if;
end $$;

-- ── Step 2: Drop any partial booster tables ───────────────
drop table if exists public.free_hit_snapshots cascade;
drop table if exists public.team_boosters cascade;

-- ── Step 3: Create booster tables ─────────────────────────
create table public.team_boosters (
  id                 uuid        primary key default gen_random_uuid(),
  fantasy_team_id    uuid        not null,
  booster_type       text        not null check (booster_type in (
                                   'batting_surge', 'keeping_surge', 'bowling_surge',
                                   'free_hit', 'triple_captain', 'mega_transfer', 'double_power'
                                 )),
  match_id           uuid        not null,
  selected_player_id uuid,
  created_at         timestamptz not null default now(),
  unique (fantasy_team_id, match_id)
);

alter table public.team_boosters
  add constraint fk_tb_team   foreign key (fantasy_team_id)    references public.fantasy_teams;
alter table public.team_boosters
  add constraint fk_tb_match  foreign key (match_id)           references public.matches;
alter table public.team_boosters
  add constraint fk_tb_player foreign key (selected_player_id) references public.players;

create table public.free_hit_snapshots (
  id                 uuid        primary key default gen_random_uuid(),
  fantasy_team_id    uuid        not null,
  match_id           uuid        not null,
  snapshot           jsonb       not null default '[]',
  created_at         timestamptz not null default now(),
  unique (fantasy_team_id, match_id)
);

alter table public.free_hit_snapshots
  add constraint fk_fhs_team  foreign key (fantasy_team_id) references public.fantasy_teams;
alter table public.free_hit_snapshots
  add constraint fk_fhs_match foreign key (match_id)        references public.matches;

-- ── Step 4: RLS ───────────────────────────────────────────
alter table public.team_boosters      enable row level security;
alter table public.free_hit_snapshots enable row level security;

create policy "Authenticated users can read team_boosters"
  on public.team_boosters for select
  using (auth.uid() is not null);

create policy "Users can manage own team_boosters"
  on public.team_boosters for all
  using (
    exists (
      select 1 from public.fantasy_teams ft
      where ft.id = team_boosters.fantasy_team_id
        and ft.user_id = auth.uid()
    )
  );

create policy "Users can manage own free_hit_snapshots"
  on public.free_hit_snapshots for all
  using (
    exists (
      select 1 from public.fantasy_teams ft
      where ft.id = free_hit_snapshots.fantasy_team_id
        and ft.user_id = auth.uid()
    )
  );

-- ── Step 5: Updated scoring trigger ──────────────────────
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
    new.wickets, new.catches, new.stumpings, new.run_outs
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
