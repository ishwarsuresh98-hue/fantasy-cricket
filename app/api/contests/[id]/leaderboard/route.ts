import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── GET /api/contests/[id]/leaderboard ────────────────────────────────────────
//
// Returns all contest members ranked by total_points descending.
// Marks which entry belongs to the calling user (is_me flag).

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contestId } = await params
  const supabase = await createClient()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Verify contest exists ─────────────────────────────────────────────────
  const { data: contest } = await supabase
    .from('contests')
    .select('id, name, prize_pool, entry_fee, max_teams, contest_category')
    .eq('id', contestId)
    .single()

  if (!contest) {
    return NextResponse.json({ error: 'Contest not found' }, { status: 404 })
  }

  // ── Entries ───────────────────────────────────────────────────────────────
  const { data: entries } = await supabase
    .from('contest_entries')
    .select('fantasy_team_id, joined_at')
    .eq('contest_id', contestId)

  if (!entries?.length) {
    return NextResponse.json({ contest, leaderboard: [], total: 0 })
  }

  const teamIds = entries.map((e) => e.fantasy_team_id)

  // ── Teams with owner profiles ─────────────────────────────────────────────
  const { data: teams, error: teamsErr } = await supabase
    .from('fantasy_teams')
    .select('id, team_name, total_points, user_id, profiles(display_name)')
    .in('id', teamIds)
    .order('total_points', { ascending: false })

  if (teamsErr) {
    console.error('[contests/leaderboard] teams query error:', teamsErr)
    return NextResponse.json({ error: teamsErr.message }, { status: 500 })
  }

  const joinedAtMap = new Map(entries.map((e) => [e.fantasy_team_id, e.joined_at]))

  const leaderboard = (teams ?? []).map((t, idx) => ({
    rank:            idx + 1,
    fantasy_team_id: t.id,
    team_name:       t.team_name,
    total_points:    t.total_points,
    user_id:         t.user_id,
    display_name:    (t.profiles as unknown as { display_name: string } | null)?.display_name ?? '—',
    joined_at:       joinedAtMap.get(t.id) ?? null,
    is_me:           t.user_id === user.id,
  }))

  return NextResponse.json({ contest, leaderboard, total: leaderboard.length })
}
