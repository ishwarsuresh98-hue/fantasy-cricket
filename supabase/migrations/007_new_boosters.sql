set search_path to public;

-- Add metadata column to team_boosters for booster-specific data
-- (e.g. Score Freeze stores the frozen_score at activation time)
alter table public.team_boosters
  add column if not exists booster_metadata jsonb not null default '{}';
