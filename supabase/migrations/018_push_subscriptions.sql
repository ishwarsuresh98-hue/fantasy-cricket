-- ── 018_push_subscriptions.sql ───────────────────────────────────────────────
-- Stores Web Push subscriptions so the server can send push notifications
-- to individual users or broadcast to all subscribers.

create table if not exists push_subscriptions (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  endpoint    text        not null,
  p256dh      text        not null,
  auth        text        not null,
  created_at  timestamptz not null default now(),

  -- one subscription row per (user, endpoint) — same device registers once
  unique (user_id, endpoint)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists push_subscriptions_user_id_idx
  on push_subscriptions (user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table push_subscriptions enable row level security;

-- Each user can manage their own subscriptions
create policy "Users manage own push subscriptions"
  on push_subscriptions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service-role key (used by the send API route) bypasses RLS automatically;
-- no extra policy needed. Anon / other users get nothing.
