-- ============================================================
-- Fantasy Cricket League — FULL SETUP (run this once)
-- Drops everything and rebuilds from scratch.
-- ============================================================

set search_path to public;

-- ── Drop everything cleanly ───────────────────────────────
drop trigger if exists trg_performance_scoring on public.match_performances;
drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.after_performance_change() cascade;
drop function if exists public.compute_base_points(int,int,int,int,bool,int,int,int,int) cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.is_admin() cascade;

drop table if exists public.free_hit_snapshots  cascade;
drop table if exists public.team_boosters        cascade;
drop table if exists public.match_performances   cascade;
drop table if exists public.fantasy_selections   cascade;
drop table if exists public.fantasy_teams        cascade;
drop table if exists public.matches              cascade;
drop table if exists public.players              cascade;
drop table if exists public.seasons              cascade;
drop table if exists public.profiles             cascade;

-- ── Profiles ──────────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role         text not null default 'member' check (role in ('admin', 'member')),
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Seasons ───────────────────────────────────────────────
create table public.seasons (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  start_date     date,
  end_date       date,
  is_active      boolean not null default false,
  team_budget    int not null default 100,
  players_per_team int not null default 11,
  created_at     timestamptz not null default now()
);

create unique index seasons_one_active on public.seasons (is_active) where is_active = true;

-- ── Players ───────────────────────────────────────────────
create table public.players (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references public.seasons(id) on delete cascade,
  name       text not null,
  role       text not null check (role in ('batsman', 'bowler', 'all_rounder', 'wicket_keeper')),
  price      int not null,
  profile_id uuid references public.profiles(id) on delete set null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Matches ───────────────────────────────────────────────
create table public.matches (
  id           uuid primary key default gen_random_uuid(),
  season_id    uuid not null references public.seasons(id) on delete cascade,
  match_number int not null,
  opponent     text not null,
  match_date   timestamptz not null,
  venue        text,
  status       text not null default 'upcoming' check (status in ('upcoming', 'completed')),
  result       text,
  created_at   timestamptz not null default now(),
  unique (season_id, match_number)
);

-- ── Fantasy Teams ─────────────────────────────────────────
create table public.fantasy_teams (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  season_id    uuid not null references public.seasons(id) on delete cascade,
  team_name    text not null,
  total_points numeric not null default 0,
  created_at   timestamptz not null default now(),
  unique (user_id, season_id)
);

-- ── Fantasy Selections ────────────────────────────────────
create table public.fantasy_selections (
  id               uuid primary key default gen_random_uuid(),
  fantasy_team_id  uuid not null references public.fantasy_teams(id) on delete cascade,
  match_id         uuid not null references public.matches(id) on delete cascade,
  player_id        uuid not null references public.players(id) on delete cascade,
  is_captain       boolean not null default false,
  is_vice_captain  boolean not null default false,
  points_earned    numeric not null default 0,
  unique (fantasy_team_id, match_id, player_id)
);

-- ── Match Performances ────────────────────────────────────
create table public.match_performances (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references public.matches(id) on delete cascade,
  player_id    uuid not null references public.players(id) on delete cascade,
  runs_scored  int not null default 0,
  balls_faced  int not null default 0,
  fours        int not null default 0,
  sixes        int not null default 0,
  did_not_bat  boolean not null default false,
  wickets      int not null default 0,
  catches      int not null default 0,
  stumpings    int not null default 0,
  run_outs     int not null default 0,
  base_points  numeric not null default 0,
  unique (match_id, player_id)
);

-- ── Booster Tables ────────────────────────────────────────
create table public.team_boosters (
  id                 uuid        primary key default gen_random_uuid(),
  fantasy_team_id    uuid        not null references public.fantasy_teams(id) on delete cascade,
  booster_type       text        not null check (booster_type in (
                                   'batting_surge', 'keeping_surge', 'bowling_surge',
                                   'free_hit', 'triple_captain', 'mega_transfer', 'double_power'
                                 )),
  match_id           uuid        not null references public.matches(id) on delete cascade,
  selected_player_id uuid        references public.players(id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (fantasy_team_id, match_id)
);

create table public.free_hit_snapshots (
  id               uuid        primary key default gen_random_uuid(),
  fantasy_team_id  uuid        not null references public.fantasy_teams(id) on delete cascade,
  match_id         uuid        not null references public.matches(id) on delete cascade,
  snapshot         jsonb       not null default '[]',
  created_at       timestamptz not null default now(),
  unique (fantasy_team_id, match_id)
);

-- ============================================================
-- Scoring Functions & Trigger
-- ============================================================

create or replace function public.compute_base_points(
  p_runs int, p_balls int, p_fours int, p_sixes int, p_did_not_bat bool,
  p_wickets int, p_catches int, p_stumpings int, p_run_outs int
) returns numeric language plpgsql as $$
declare pts numeric := 0;
begin
  if not p_did_not_bat then
    pts := pts + p_runs + p_fours + (p_sixes * 2);
    if    p_runs >= 100 then pts := pts + 16;
    elsif p_runs >= 50  then pts := pts + 8;
    end if;
    if p_runs = 0 and p_balls > 0 then pts := pts - 2; end if;
  end if;
  pts := pts + (p_wickets * 25);
  if    p_wickets >= 5 then pts := pts + 16;
  elsif p_wickets >= 4 then pts := pts + 8;
  elsif p_wickets >= 3 then pts := pts + 4;
  end if;
  pts := pts + (p_catches * 8) + (p_stumpings * 12) + (p_run_outs * 6);
  return pts;
end;
$$;

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
    where fs.match_id = new.match_id and fs.player_id = new.player_id
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

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles          enable row level security;
alter table public.seasons           enable row level security;
alter table public.players           enable row level security;
alter table public.matches           enable row level security;
alter table public.fantasy_teams     enable row level security;
alter table public.fantasy_selections enable row level security;
alter table public.match_performances enable row level security;
alter table public.team_boosters     enable row level security;
alter table public.free_hit_snapshots enable row level security;

create or replace function public.is_admin()
returns boolean language sql security definer as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Profiles
create policy "Users can read own profile"   on public.profiles for select using (id = auth.uid() or is_admin());
create policy "Users can update own profile" on public.profiles for update using (id = auth.uid());
create policy "Admins can read all profiles" on public.profiles for select using (is_admin());

-- Seasons
create policy "Authenticated read seasons"  on public.seasons for select using (auth.uid() is not null);
create policy "Admins can manage seasons"   on public.seasons for all    using (is_admin());

-- Players
create policy "Authenticated read players"  on public.players for select using (auth.uid() is not null);
create policy "Admins can manage players"   on public.players for all    using (is_admin());

-- Matches
create policy "Authenticated read matches"  on public.matches for select using (auth.uid() is not null);
create policy "Admins can manage matches"   on public.matches for all    using (is_admin());

-- Fantasy Teams
create policy "Authenticated read teams"    on public.fantasy_teams for select using (auth.uid() is not null);
create policy "Users can manage own team"   on public.fantasy_teams for all    using (user_id = auth.uid());

-- Fantasy Selections
create policy "Authenticated read selections" on public.fantasy_selections for select using (auth.uid() is not null);
create policy "Users can manage own selections" on public.fantasy_selections for all using (
  exists (select 1 from public.fantasy_teams where id = fantasy_selections.fantasy_team_id and user_id = auth.uid())
);

-- Match Performances
create policy "Authenticated read performances" on public.match_performances for select using (auth.uid() is not null);
create policy "Admins can manage performances"  on public.match_performances for all    using (is_admin());

-- Team Boosters
create policy "Authenticated read team_boosters" on public.team_boosters for select using (auth.uid() is not null);
create policy "Users can manage own team_boosters" on public.team_boosters for all using (
  exists (select 1 from public.fantasy_teams ft where ft.id = team_boosters.fantasy_team_id and ft.user_id = auth.uid())
);

-- Free Hit Snapshots
create policy "Users can manage own free_hit_snapshots" on public.free_hit_snapshots for all using (
  exists (select 1 from public.fantasy_teams ft where ft.id = free_hit_snapshots.fantasy_team_id and ft.user_id = auth.uid())
);
