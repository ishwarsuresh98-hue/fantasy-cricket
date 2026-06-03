-- ── Migration 020: Withdrawal Requests ────────────────────────────────────────

create table if not exists public.withdrawal_requests (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  amount           numeric     not null check (amount >= 10),
  account_name     text        not null,
  sort_code        text        not null,
  account_number   text        not null,
  status           text        not null default 'pending'
                               check (status in ('pending','completed','rejected','manual_required')),
  stripe_payout_id text,
  admin_notes      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.withdrawal_requests enable row level security;

-- Users can read their own requests
create policy "withdrawal_requests_select_own"
  on public.withdrawal_requests for select
  to authenticated
  using (user_id = auth.uid());

-- Users can insert their own requests
create policy "withdrawal_requests_insert_own"
  on public.withdrawal_requests for insert
  to authenticated
  with check (user_id = auth.uid());

-- Index for admin listing
create index if not exists withdrawal_requests_status_idx    on public.withdrawal_requests (status);
create index if not exists withdrawal_requests_user_id_idx   on public.withdrawal_requests (user_id);
create index if not exists withdrawal_requests_created_at_idx on public.withdrawal_requests (created_at desc);
