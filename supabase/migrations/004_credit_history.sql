-- ============================================================
-- Dynamic credit system — player credit history
-- ============================================================

set search_path to public;

-- Track credit changes per player per match
create table if not exists public.player_credit_history (
  id            uuid        primary key default gen_random_uuid(),
  player_id     uuid        not null references public.players(id) on delete cascade,
  match_id      uuid        not null references public.matches(id) on delete cascade,
  credit_before numeric(5,1) not null,
  credit_after  numeric(5,1) not null,
  base_points   numeric     not null default 0,
  match_avg     numeric     not null default 0,
  created_at    timestamptz not null default now(),
  unique (player_id, match_id)
);

alter table public.player_credit_history enable row level security;

create policy "Authenticated read credit_history"
  on public.player_credit_history for select
  using (auth.uid() is not null);

create policy "Admins manage credit_history"
  on public.player_credit_history for all
  using (public.is_admin());

-- ── adjust_player_credits(match_id) ───────────────────────
-- Call once after all stats are saved for a match.
-- +0.5 credit if above match average, -0.5 if below.
-- Capped 6.0 – 11.0. Idempotent: skips players already processed.
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
  -- Compute match average base_points across all recorded performances
  select avg(base_points) into v_avg
  from public.match_performances
  where match_id = p_match_id;

  if v_avg is null then return; end if;

  for v_rec in
    select mp.player_id, mp.base_points, pl.price as current_credit
    from   public.match_performances mp
    join   public.players pl on pl.id = mp.player_id
    where  mp.match_id = p_match_id
  loop
    v_old_credit := v_rec.current_credit;

    if    v_rec.base_points > v_avg then v_new_credit := least(11.0, v_old_credit + 0.5);
    elsif v_rec.base_points < v_avg then v_new_credit := greatest(6.0, v_old_credit - 0.5);
    else                                  v_new_credit := v_old_credit;
    end if;

    -- Insert history row; skip if already processed for this match
    insert into public.player_credit_history
      (player_id, match_id, credit_before, credit_after, base_points, match_avg)
    values
      (v_rec.player_id, p_match_id, v_old_credit, v_new_credit, v_rec.base_points, v_avg)
    on conflict (player_id, match_id) do nothing;

    -- FOUND = true only when the INSERT actually wrote a row (not on conflict)
    if found then
      update public.players set price = v_new_credit where id = v_rec.player_id;
    end if;
  end loop;
end;
$$;
