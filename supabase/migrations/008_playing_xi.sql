-- 008_playing_xi.sql
-- Stores admin-confirmed playing XI for each match

create table if not exists public.match_playing_xi (
  id         uuid        primary key default gen_random_uuid(),
  match_id   uuid        not null references public.matches(id)  on delete cascade,
  player_id  uuid        not null references public.players(id)  on delete cascade,
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

alter table public.match_playing_xi enable row level security;

-- Everyone can read the playing XI (members need this to see badges in TeamBuilder)
create policy "Anyone authenticated can view playing XI"
  on public.match_playing_xi for select
  using (auth.role() = 'authenticated');

-- Only admins can insert / update / delete
create policy "Admins can manage playing XI"
  on public.match_playing_xi for all
  using (public.is_admin())
  with check (public.is_admin());
