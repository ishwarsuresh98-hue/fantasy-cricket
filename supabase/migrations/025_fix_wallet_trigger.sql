-- ── Migration 025: Fix handle_new_user trigger + wallet column defaults ────────
--
-- Problem: the production wallets table has NOT NULL columns added after
-- migration 019 (bonus_balance, total_deposited, total_withdrawn, total_won,
-- currency) with no defaults. The handle_new_user trigger auto-creates a wallet
-- for every new user, but the INSERT now fails because those columns have no
-- defaults — causing "Database error saving new user" on sign-up.
--
-- Fix:
--   1. Add defaults to the wallet columns (safe, non-breaking for existing rows).
--   2. Rewrite handle_new_user to explicitly provide all NOT NULL wallet columns.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add column defaults so the table is safe even without an explicit value ─

alter table public.wallets
  add column if not exists bonus_balance    numeric not null default 0,
  add column if not exists total_deposited  numeric not null default 0,
  add column if not exists total_withdrawn  numeric not null default 0,
  add column if not exists total_won        numeric not null default 0,
  add column if not exists currency         text    not null default 'GBP';

-- Set defaults on existing columns in case they were added without them
alter table public.wallets alter column bonus_balance    set default 0;
alter table public.wallets alter column total_deposited  set default 0;
alter table public.wallets alter column total_withdrawn  set default 0;
alter table public.wallets alter column total_won        set default 0;
alter table public.wallets alter column currency         set default 'GBP';

-- ── 2. Rewrite handle_new_user to create profile + wallet atomically ──────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Create profile row
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

  -- Create wallet row (all NOT NULL columns provided explicitly)
  insert into public.wallets (user_id, currency, balance, bonus_balance, total_deposited, total_withdrawn, total_won)
  values (new.id, 'GBP', 0, 0, 0, 0, 0)
  on conflict (user_id) do nothing;   -- idempotent: no-op if wallet already exists

  return new;
end;
$$;

-- Ensure the trigger is in place (re-create if dropped)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
