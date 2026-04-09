-- ============================================================
-- Fantasy Cricket League — Initial Schema
-- Run this in Supabase SQL Editor (in order)
-- ============================================================

-- ── Profiles ──────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── Seasons ───────────────────────────────────────────────
create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  is_active boolean not null default false,
  team_budget int not null default 100,
  players_per_team int not null default 11,
  created_at timestamptz not null default now()
);

-- Only one season can be active at a time
create unique index if not exists seasons_one_active
  on seasons (is_active) where is_active = true;

-- ── Players ───────────────────────────────────────────────
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  name text not null,
  role text not null check (role in ('batsman', 'bowler', 'all_rounder', 'wicket_keeper')),
  price int not null,
  profile_id uuid references profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Matches ───────────────────────────────────────────────
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  match_number int not null,
  opponent text not null,
  match_date timestamptz not null,
  venue text,
  status text not null default 'upcoming' check (status in ('upcoming', 'completed')),
  result text,
  created_at timestamptz not null default now(),
  unique (season_id, match_number)
);

-- ── Fantasy Teams ──────────────────────────────────────────
create table if not exists fantasy_teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  season_id uuid not null references seasons(id) on delete cascade,
  team_name text not null,
  total_points numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, season_id)
);

-- ── Fantasy Selections ────────────────────────────────────
create table if not exists fantasy_selections (
  id uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references fantasy_teams(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  is_captain boolean not null default false,
  is_vice_captain boolean not null default false,
  points_earned numeric not null default 0,
  unique (fantasy_team_id, match_id, player_id)
);

-- ── Match Performances ────────────────────────────────────
create table if not exists match_performances (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  runs_scored int not null default 0,
  balls_faced int not null default 0,
  fours int not null default 0,
  sixes int not null default 0,
  did_not_bat boolean not null default false,
  wickets int not null default 0,
  catches int not null default 0,
  stumpings int not null default 0,
  run_outs int not null default 0,
  base_points numeric not null default 0,
  unique (match_id, player_id)
);

-- ============================================================
-- Scoring Function & Trigger
-- ============================================================

create or replace function compute_base_points(
  p_runs int, p_balls int, p_fours int, p_sixes int, p_did_not_bat bool,
  p_wickets int, p_catches int, p_stumpings int, p_run_outs int
) returns numeric language plpgsql as $$
declare
  pts numeric := 0;
begin
  -- Batting (only if player batted)
  if not p_did_not_bat then
    pts := pts + p_runs;                        -- 1pt per run
    pts := pts + p_fours;                       -- +1 per four
    pts := pts + (p_sixes * 2);                 -- +2 per six
    if p_runs >= 100 then pts := pts + 16;      -- century bonus
    elsif p_runs >= 50 then pts := pts + 8;     -- fifty bonus
    end if;
    if p_runs = 0 and p_balls > 0 then pts := pts - 2; end if; -- duck
  end if;

  -- Bowling
  pts := pts + (p_wickets * 25);
  if p_wickets >= 5 then pts := pts + 16;
  elsif p_wickets >= 4 then pts := pts + 8;
  elsif p_wickets >= 3 then pts := pts + 4;
  end if;

  -- Fielding
  pts := pts + (p_catches * 8);
  pts := pts + (p_stumpings * 12);
  pts := pts + (p_run_outs * 6);

  return pts;
end;
$$;

-- Trigger: when a performance is inserted/updated, recalculate all related fantasy points
create or replace function after_performance_change()
returns trigger language plpgsql security definer as $$
declare
  v_base numeric;
  v_selection record;
  v_multiplier numeric;
  v_team_id uuid;
begin
  -- Compute base points for this performance
  v_base := compute_base_points(
    new.runs_scored, new.balls_faced, new.fours, new.sixes, new.did_not_bat,
    new.wickets, new.catches, new.stumpings, new.run_outs
  );

  -- Store base_points on the row
  new.base_points := v_base;

  -- Update all fantasy selections that picked this player for this match
  for v_selection in
    select id, fantasy_team_id, is_captain, is_vice_captain
    from fantasy_selections
    where match_id = new.match_id and player_id = new.player_id
  loop
    if v_selection.is_captain then
      v_multiplier := 2;
    elsif v_selection.is_vice_captain then
      v_multiplier := 1.5;
    else
      v_multiplier := 1;
    end if;

    update fantasy_selections
    set points_earned = v_base * v_multiplier
    where id = v_selection.id;

    -- Recalculate team total
    update fantasy_teams
    set total_points = (
      select coalesce(sum(points_earned), 0)
      from fantasy_selections
      where fantasy_team_id = v_selection.fantasy_team_id
    )
    where id = v_selection.fantasy_team_id;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_performance_scoring on match_performances;
create trigger trg_performance_scoring
  before insert or update on match_performances
  for each row execute procedure after_performance_change();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table profiles enable row level security;
alter table seasons enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table fantasy_teams enable row level security;
alter table fantasy_selections enable row level security;
alter table match_performances enable row level security;

-- Helper: is current user an admin?
create or replace function is_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Profiles
create policy "Users can read own profile" on profiles for select using (id = auth.uid() or is_admin());
create policy "Users can update own profile" on profiles for update using (id = auth.uid());
create policy "Admins can read all profiles" on profiles for select using (is_admin());

-- Seasons
create policy "Anyone authenticated can read seasons" on seasons for select using (auth.uid() is not null);
create policy "Admins can manage seasons" on seasons for all using (is_admin());

-- Players
create policy "Anyone authenticated can read players" on players for select using (auth.uid() is not null);
create policy "Admins can manage players" on players for all using (is_admin());

-- Matches
create policy "Anyone authenticated can read matches" on matches for select using (auth.uid() is not null);
create policy "Admins can manage matches" on matches for all using (is_admin());

-- Fantasy Teams
create policy "Anyone authenticated can read teams" on fantasy_teams for select using (auth.uid() is not null);
create policy "Users can manage own team" on fantasy_teams for all using (user_id = auth.uid());

-- Fantasy Selections
create policy "Anyone authenticated can read selections" on fantasy_selections for select using (auth.uid() is not null);
create policy "Users can manage own selections" on fantasy_selections for all using (
  exists (
    select 1 from fantasy_teams
    where id = fantasy_selections.fantasy_team_id and user_id = auth.uid()
  )
);

-- Match Performances
create policy "Anyone authenticated can read performances" on match_performances for select using (auth.uid() is not null);
create policy "Admins can manage performances" on match_performances for all using (is_admin());
