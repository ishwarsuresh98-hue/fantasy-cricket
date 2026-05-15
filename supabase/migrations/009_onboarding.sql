-- 009_onboarding.sql
-- Track whether a user has completed the first-time onboarding walkthrough

alter table public.profiles
  add column if not exists onboarding_complete boolean not null default false;
