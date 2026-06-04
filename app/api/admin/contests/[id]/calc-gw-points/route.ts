import { NextResponse }    from 'next/server'
import { createClient }    from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeBasePoints } from '@/lib/scoring'
import type { ContestTeamPlayer } from '@/types'

// ── POST /api/admin/contests/[id]/calc-gw-points ──────────────────────────────
//
// After a gameweek match ends, calculate total_points for every contest_team
// in this contest, then update ranks.
//
// Requires admin role.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contestId } = await params
  const supabase = await createClient()

  // ── Auth + admin check ────────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // ── Load contest + match ──────────────────────────────────────────────────
  const { data: contest } = await admin
    .from('contests')
    .select('id, name, match_id, gameweek_id')
    .eq('id', contestId)
    .single()

  if (!contest) return NextResponse.json({ error: 'Contest not found' }, { status: 404 })

  // Determine match_id: from contest directly or via gameweek
  let matchId: string | null = contest.match_id ?? null

  if (!matchId && contest.gameweek_id) {
    const { data: gw } = await admin
      .from('gameweeks')
      .select('match_id')
      .eq('id', contest.gameweek_id)
      .single()
    matchId = gw?.match_id ?? null
  }

  if (!matchId) {
    return NextResponse.json({ error: 'Contest has no associated match — cannot calculate points' }, { status: 400 })
  }

  // ── Load match performances ───────────────────────────────────────────────
  const { data: performances } = await admin
    .from('match_performances')
    .select('*')
    .eq('match_id', matchId)

  if (!performances || performances.length === 0) {
    return NextResponse.json({ error: 'No match performances found — enter stats first' }, { status: 400 })
  }

  // Build lookup: player_id → base_points
  const perfMap: Record<string, number> = {}
  for (const perf of performances) {
    perfMap[perf.player_id as string] = computeBasePoints(perf)
  }

  // ── Load all contest_teams for this contest ───────────────────────────────
  const { data: contestTeams } = await admin
    .from('contest_teams')
    .select('id, players')
    .eq('contest_id', contestId)

  if (!contestTeams || contestTeams.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, message: 'No contest teams found' })
  }

  // ── Calculate total_points per team ──────────────────────────────────────
  const updates: { id: string; total_points: number }[] = contestTeams.map((ct) => {
    const picks = (ct.players ?? []) as ContestTeamPlayer[]
    let total = 0
    for (const pick of picks) {
      const base = perfMap[pick.player_id] ?? 0
      if (pick.is_captain)       total += base * 2
      else if (pick.is_vice_captain) total += base * 1.5
      else                       total += base
    }
    return { id: ct.id as string, total_points: Math.round(total * 100) / 100 }
  })

  // ── Sort for rank assignment ──────────────────────────────────────────────
  updates.sort((a, b) => b.total_points - a.total_points)

  // ── Update each row individually (Supabase doesn't support bulk CASE UPDATE) ─
  let updatedCount = 0
  for (let i = 0; i < updates.length; i++) {
    const { id, total_points } = updates[i]
    const rank = i + 1
    const { error } = await admin
      .from('contest_teams')
      .update({ total_points, rank })
      .eq('id', id)

    if (!error) updatedCount++
    else console.error(`[calc-gw-points] update error for team ${id}:`, error)
  }

  // ── Distribute prizes now that every team has a rank ─────────────────────
  const contestTitle = ((contest as unknown as Record<string, unknown>).title as string | null)
    ?? (contest as unknown as Record<string, unknown>).name as string
    ?? contestId

  if (updatedCount > 0) {
    const { error: distErr } = await admin.rpc('distribute_contest_prizes', {
      p_contest_id: contestId,
    })

    if (distErr) {
      // Non-fatal: log and surface in the response but don't fail the request
      console.error(`[calc-gw-points] prize distribution error for ${contestId}:`, distErr.message)
      return NextResponse.json({
        ok:            true,
        updated:       updatedCount,
        contest:       contestTitle,
        prizes_error:  distErr.message,
      })
    }

    console.log(`[calc-gw-points] Prizes distributed for contest ${contestTitle} (${contestId})`)
  }

  return NextResponse.json({
    ok:      true,
    updated: updatedCount,
    contest: contestTitle,
    prizes:  updatedCount > 0 ? 'distributed' : 'skipped — no teams updated',
  })
}
