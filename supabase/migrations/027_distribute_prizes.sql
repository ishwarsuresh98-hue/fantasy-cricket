-- ── Migration 027: Automatic contest prize distribution ──────────────────────
--
-- Changes:
--   1. contests.prizes_distributed — flag so distribution never runs twice
--   2. Extend wallet_transactions.type constraint to include contest_win
--      (and the other types already in use across the codebase)
--   3. distribute_contest_prizes(contest_id) — pays winners, records
--      wallet_transactions, updates wallet balances, writes contest_payouts
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add prizes_distributed flag ───────────────────────────────────────────

alter table public.contests
  add column if not exists prizes_distributed boolean not null default false;

-- ── 2. Extend wallet_transactions.type to include contest_win ────────────────

alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_type_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_type_check
  check (type in (
    'credit', 'debit',
    'deposit', 'withdrawal',
    'contest_entry', 'contest_win',
    'bonus', 'referral', 'refund', 'topup'
  ));

-- ── 3. distribute_contest_prizes(p_contest_id) ───────────────────────────────
--
-- Algorithm:
--   a. Guard: return immediately if prizes_distributed = true
--   b. Determine prize pool: final_prize_pool (open_league) else prize_pool
--   c. For each slot in prize_structure:
--        v_payout = prize_pool × prize_pct / 100 ÷ number_of_positions_in_slot
--      For each contest_team whose rank falls in that slot:
--        – INSERT wallet_transaction (contest_win), skip on duplicate reference_id
--        – UPDATE wallets.balance and wallets.total_won
--        – INSERT contest_payouts row
--        – RAISE LOG for Vercel log visibility
--   d. Set prizes_distributed = true, status = 'completed'

create or replace function public.distribute_contest_prizes(p_contest_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest       record;
  v_prize_pool    numeric;
  v_gw_name       text := '';
  v_slot          record;
  v_team          record;
  v_wallet_id     uuid;
  v_balance       numeric;
  v_payout        numeric;
  v_slot_positions integer;
  v_rank_label    text;
  v_row_count     integer;
begin

  -- ── Guard: load contest + idempotency check ─────────────────────────────
  select id, title, type, prize_pool, final_prize_pool, prize_structure,
         gameweek_id, prizes_distributed, status
  into   v_contest
  from   public.contests
  where  id = p_contest_id;

  if not found then
    raise exception '[prizes] Contest % not found', p_contest_id;
  end if;

  if v_contest.prizes_distributed then
    raise notice '[prizes] Contest % already distributed — skipping', p_contest_id;
    return;
  end if;

  if v_contest.prize_structure is null then
    raise exception '[prizes] Contest % has no prize_structure', p_contest_id;
  end if;

  -- ── Determine effective prize pool ──────────────────────────────────────
  v_prize_pool := coalesce(v_contest.final_prize_pool, v_contest.prize_pool);

  if v_prize_pool is null or v_prize_pool <= 0 then
    raise exception '[prizes] Contest % has no positive prize pool', p_contest_id;
  end if;

  -- ── Gameweek name for the description ───────────────────────────────────
  if v_contest.gameweek_id is not null then
    select name into v_gw_name
    from   public.gameweeks
    where  id = v_contest.gameweek_id;
    v_gw_name := coalesce(v_gw_name, '') || ' — ';
  end if;

  -- ── Pay each prize slot ──────────────────────────────────────────────────
  for v_slot in
    select (s->>'rank_from')::integer as rank_from,
           (s->>'rank_to')::integer   as rank_to,
           (s->>'prize_pct')::numeric as prize_pct
    from   jsonb_array_elements(v_contest.prize_structure::jsonb) s
  loop
    v_slot_positions := v_slot.rank_to - v_slot.rank_from + 1;
    -- Split evenly when a slot covers multiple ranks (e.g. "4th–5th place")
    v_payout := round(v_prize_pool * v_slot.prize_pct / 100.0 / v_slot_positions, 2);

    if v_payout <= 0 then continue; end if;

    for v_team in
      select ct.id, ct.user_id, ct.rank, ct.total_points
      from   public.contest_teams ct
      where  ct.contest_id = p_contest_id
        and  ct.rank >= v_slot.rank_from
        and  ct.rank <= v_slot.rank_to
      order  by ct.rank asc
    loop
      -- Rank label for description
      v_rank_label := case v_team.rank
        when 1 then '1st'
        when 2 then '2nd'
        when 3 then '3rd'
        else        v_team.rank::text || 'th'
      end;

      -- Find wallet
      select id, balance into v_wallet_id, v_balance
      from   public.wallets
      where  user_id = v_team.user_id;

      if v_wallet_id is null then
        raise warning '[prizes] No wallet for user % — skipping payout', v_team.user_id;
        continue;
      end if;

      -- Insert transaction; skip if already done (idempotent via reference_id)
      insert into public.wallet_transactions (
        user_id, type, amount, balance_before, balance_after,
        reference_id, contest_id, description, status
      ) values (
        v_team.user_id,
        'contest_win',
        v_payout,
        v_balance,
        v_balance + v_payout,
        p_contest_id::text || '-rank-' || v_team.rank::text,
        p_contest_id,
        v_gw_name || coalesce(v_contest.title, 'Contest') || ' — ' || v_rank_label || ' place prize',
        'completed'
      )
      on conflict (reference_id) do nothing;

      get diagnostics v_row_count = row_count;

      if v_row_count > 0 then
        -- Credit wallet only if the transaction row was newly inserted
        update public.wallets
        set    balance   = balance   + v_payout,
               total_won = total_won + v_payout
        where  id = v_wallet_id;

        raise log '[prizes] Paid £% to user % for contest % (% place)',
          v_payout, v_team.user_id, coalesce(v_contest.title, p_contest_id::text), v_rank_label;
      end if;

      -- Record in contest_payouts (best-effort — skip if row already exists)
      insert into public.contest_payouts (
        contest_id, entry_id, user_id, rank, amount, status, paid_at
      ) values (
        p_contest_id, v_team.id, v_team.user_id, v_team.rank, v_payout, 'paid', now()
      )
      on conflict do nothing;

    end loop;
  end loop;

  -- ── Mark contest as prizes distributed + completed ───────────────────────
  update public.contests
  set    prizes_distributed = true,
         status             = 'completed'
  where  id = p_contest_id;

  raise log '[prizes] Distribution complete for contest % (pool £%)',
    coalesce(v_contest.title, p_contest_id::text), v_prize_pool;

end;
$$;

revoke all     on function public.distribute_contest_prizes(uuid) from public, anon;
grant  execute on function public.distribute_contest_prizes(uuid) to authenticated;
