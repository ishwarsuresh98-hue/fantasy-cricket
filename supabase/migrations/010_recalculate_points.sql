-- ============================================================
-- One-shot helper: recalculate base_points for every row in
-- match_performances by triggering the existing scoring trigger.
--
-- The BEFORE UPDATE trigger (trg_performance_scoring) already handles
-- compute_base_points → fantasy_selections.points_earned →
-- fantasy_teams.total_points.  A no-op UPDATE fires it for every row.
--
-- SECURITY DEFINER lets an authenticated admin call this via RPC without
-- needing direct UPDATE permission on match_performances.
-- ============================================================

set search_path to public;

create or replace function public.recalculate_all_points()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- Touch every row: the BEFORE UPDATE trigger recalculates points for each.
  update public.match_performances
  set    runs_scored = runs_scored    -- semantic no-op; fires trg_performance_scoring
  where  id is not null;             -- satisfies Supabase's "no unbounded UPDATE" guard

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Only admins should call this; row-level callers are restricted via the API layer.
-- Revoke broad access so anon/service roles can't call it directly.
revoke all on function public.recalculate_all_points() from public, anon;
grant execute on function public.recalculate_all_points() to authenticated;
