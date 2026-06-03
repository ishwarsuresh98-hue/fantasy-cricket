-- ── Migration 019: Wallet & Transaction History ────────────────────────────────
--
-- Ensures wallets and wallet_transactions tables exist with the correct schema.
-- Safe to run even if the tables were already created manually — uses
-- IF NOT EXISTS and ADD COLUMN IF NOT EXISTS throughout.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── wallets ───────────────────────────────────────────────────────────────────

create table if not exists public.wallets (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null unique references auth.users(id) on delete cascade,
  balance    numeric     not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add updated_at if the table existed without it
alter table public.wallets
  add column if not exists updated_at timestamptz not null default now();

alter table public.wallets enable row level security;

-- Users can only read their own wallet
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'wallets' and policyname = 'wallets_select_own'
  ) then
    create policy "wallets_select_own"
      on public.wallets for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

-- ── wallet_transactions ───────────────────────────────────────────────────────

create table if not exists public.wallet_transactions (
  id           uuid        primary key default gen_random_uuid(),
  wallet_id    uuid        not null references public.wallets(id) on delete cascade,
  type         text        not null check (type in ('credit', 'debit')),
  amount       numeric     not null check (amount > 0),
  description  text        not null default '',
  reference_id text,
  created_at   timestamptz not null default now()
);

-- Add reference_id if the table existed without it
alter table public.wallet_transactions
  add column if not exists reference_id text;

-- Add description if missing
alter table public.wallet_transactions
  add column if not exists description text not null default '';

alter table public.wallet_transactions enable row level security;

-- Users can read their own transactions (via wallet ownership)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'wallet_transactions' and policyname = 'wallet_transactions_select_own'
  ) then
    create policy "wallet_transactions_select_own"
      on public.wallet_transactions for select
      to authenticated
      using (
        wallet_id in (
          select id from public.wallets where user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Unique constraint on reference_id to enforce idempotency
-- (a second insert with the same reference_id will be rejected with error code 23505)
create unique index if not exists wallet_transactions_reference_id_idx
  on public.wallet_transactions (reference_id)
  where reference_id is not null;

-- Indexes for fast lookups
create index if not exists wallet_transactions_wallet_id_idx
  on public.wallet_transactions (wallet_id);

create index if not exists wallets_user_id_idx
  on public.wallets (user_id);
