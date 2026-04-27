set search_path to public;

-- 1. WhatsApp number on profiles
alter table public.profiles
  add column if not exists whatsapp_number text;

-- 2. Notifications table
create table if not exists public.notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  type        text        not null check (type in ('rank_change', 'points_update')),
  title       text        not null,
  body        text        not null,
  is_read     boolean     not null default false,
  metadata    jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_created
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread
  on public.notifications (user_id, created_at desc)
  where is_read = false;

alter table public.notifications enable row level security;

create policy "Users read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users mark own notifications read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admins can insert notifications for any user (used after stats entry)
create policy "Admins insert notifications"
  on public.notifications for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
