-- ── Migration 021: Club memberships & multi-club subscription ─────────────────
--
-- club_memberships  — which clubs a user has joined (many-to-many)
-- memberships       — paid £5/year multi-club subscription
-- profiles.club_id  — primary club (set at sign-up)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Add primary club to profiles ─────────────────────────────────────────────
alter table public.profiles
  add column if not exists club_id uuid references public.clubs(id) on delete set null;

-- ── club_memberships ──────────────────────────────────────────────────────────
-- Tracks every club a user belongs to. First club is free; subsequent clubs
-- require an active row in the memberships table.

create table if not exists public.club_memberships (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  club_id    uuid        not null references public.clubs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, club_id)
);

alter table public.club_memberships enable row level security;

create policy "club_memberships_select_own"
  on public.club_memberships for select
  to authenticated
  using (user_id = auth.uid());

create policy "club_memberships_insert_own"
  on public.club_memberships for insert
  to authenticated
  with check (user_id = auth.uid());

create index if not exists club_memberships_user_id_idx on public.club_memberships (user_id);
create index if not exists club_memberships_club_id_idx on public.club_memberships (club_id);

-- ── memberships (multi-club subscription) ────────────────────────────────────
-- A user with an active membership can join unlimited clubs.
-- Without it, only one club is allowed.

create table if not exists public.memberships (
  id                     uuid        primary key default gen_random_uuid(),
  user_id                uuid        not null references auth.users(id) on delete cascade,
  stripe_subscription_id text,
  stripe_customer_id     text,
  status                 text        not null default 'inactive'
                                     check (status in ('active', 'inactive', 'cancelled', 'past_due')),
  expires_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id)
);

alter table public.memberships enable row level security;

create policy "memberships_select_own"
  on public.memberships for select
  to authenticated
  using (user_id = auth.uid());

create index if not exists memberships_user_id_idx on public.memberships (user_id);
create index if not exists memberships_status_idx  on public.memberships (status);
