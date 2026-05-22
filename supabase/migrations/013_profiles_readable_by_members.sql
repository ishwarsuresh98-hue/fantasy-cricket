-- Migration 013: Allow all authenticated members to read all profiles
--
-- Problem: the existing RLS on `profiles` only lets a user read their own row
-- (unless they're an admin). This breaks the Teams and Leaderboard pages where
-- the Supabase join `profiles(display_name)` silently returns null for every
-- team owner who is not the currently-logged-in user.
--
-- Fix: add a broad SELECT policy so any authenticated session can read all
-- profiles. This is appropriate for a private club app where every member is
-- already known and trusted. The restrictive UPDATE policy is unchanged, so
-- users can still only edit their own profile.

create policy "Members can read all profiles"
  on profiles
  for select
  using (auth.uid() is not null);
