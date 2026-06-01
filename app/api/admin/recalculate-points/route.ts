import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeBasePoints } from '@/lib/scoring'
import type { PlayerRole }   from '@/types'

// ── POST /api/admin/recalculate-points ────────────────────────────────────────
//
// Recalculates base_points for every match_performance row, applying the same
// TypeScript computeBasePoints logic (including role-based SR gating) used by
// the sync/results route.  Then propagates updated totals to all contest_teams
// and re-ranks every contest leaderboard.
//
// Replaces the old supabase.rpc('recalculate_all_points') call which used a
// separate Postgres function that was out of sync with computeBasePoints and
// didn't update contest_teams at all.
//
// Requires admin role.

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // ── 1. Load all match_performances ───────────────────────────────────────
  const { data: perfs, error: perfsErr } = await admin
    .from('match_performances')
    .select('id, match_id, player_id, runs_scored, balls_faced, fours, sixes, did_not_bat, wickets, catches, stumpings, run_outs, dot_balls, maidens, base_points')

  if (perfsErr) return NextResponse.json({ error: perfsErr.message }, { status: 500 })
  if (!perfs?.length) return NextResponse.json({ rowsUpdated: 0, teamsUpdated: 0 })

  // ── 2. Load all player roles in one query ─────────────────────────────────
  const allPlayerIds = [...new Set(perfs.map(p => p.player_id as string))]
  const { data: players } = await admin
    .from('players')
    .select('id, role')
    .in('id', allPlayerIds)

  const roleById: Record<string, PlayerRole> = {}
  for (const p of players ?? []) {
    roleById[p.id as string] = p.role as PlayerRole
  }

  // ── 3. Recalculate base_points for each row ───────────────────────────────
  let rowsUpdated = 0

  // Build an in-memory map of perf objects enriched with player_role for scoring,
  // and collect which match_ids are affected for the leaderboard step.
  const affectedMatchIds = new Set<string>()
  // perfByPlayer[match_id][player_id] = enriched perf
  const perfByMatch: Record<string, Record<string, {
    player_id: string
    player_role: PlayerRole | null
    runs_scored: number; balls_faced: number; fours: number; sixes: number
    did_not_bat: boolean; wickets: number; catches: number; stumpings: number
    run_outs: number; dot_balls: number; maidens: number; base_points: number
  }>> = {}

  for (const row of perfs) {
    const matchId  = row.match_id  as string
    const playerId = row.player_id as string
    const role     = roleById[playerId] ?? null

    const enriched = {
      player_id:   playerId,
      player_role: role,
      runs_scored:  Number(row.runs_scored)  || 0,
      balls_faced:  Number(row.balls_faced)  || 0,
      fours:        Number(row.fours)        || 0,
      sixes:        Number(row.sixes)        || 0,
      did_not_bat:  Boolean(row.did_not_bat),
      wickets:      Number(row.wickets)      || 0,
      catches:      Number(row.catches)      || 0,
      stumpings:    Number(row.stumpings)    || 0,
      run_outs:     Number(row.run_outs)     || 0,
      dot_balls:    Number(row.dot_balls)    || 0,
      maidens:      Number(row.maidens)      || 0,
      base_points:  0,
    }

    enriched.base_points = computeBasePoints(enriched)

    if (!perfByMatch[matchId]) perfByMatch[matchId] = {}
    perfByMatch[matchId][playerId] = enriched

    // Only update rows where the score actually changed
    if (enriched.base_points !== Number(row.base_points)) {
      await admin
        .from('match_performances')
        .update({ base_points: enriched.base_points })
        .eq('id', row.id as string)
      rowsUpdated++
      affectedMatchIds.add(matchId)
    }
  }

  // ── 4. Rebuild contest_team totals and ranks for every affected match ─────
  let teamsUpdated = 0

  for (const matchId of affectedMatchIds) {
    const perfMap = perfByMatch[matchId]

    // Direct contests
    const { data: directContests } = await admin
      .from('contests').select('id').eq('match_id', matchId)

    // Gameweek contests
    const { data: gw } = await admin
      .from('gameweeks').select('id').eq('match_id', matchId).maybeSingle()
    const gwContests = gw
      ? await admin.from('contests').select('id').eq('gameweek_id', gw.id).then(r => r.data ?? [])
      : []

    const allContestIds = [
      ...(directContests ?? []).map(c => c.id as string),
      ...gwContests.map(c => c.id as string),
    ]

    for (const contestId of allContestIds) {
      const { data: teams } = await admin
        .from('contest_teams')
        .select('id, players')
        .eq('contest_id', contestId)

      if (!teams?.length) continue

      const updates = teams.map(ct => {
        const picks = (ct.players ?? []) as { player_id: string; is_captain: boolean; is_vice_captain: boolean }[]
        let total = 0
        for (const pick of picks) {
          const perf = perfMap[pick.player_id]
          const base = perf ? computeBasePoints(perf) : 0
          total += pick.is_captain ? base * 2 : pick.is_vice_captain ? base * 1.5 : base
        }
        return { id: ct.id as string, total_points: Math.round(total * 10) / 10 }
      })

      updates.sort((a, b) => b.total_points - a.total_points)

      for (let i = 0; i < updates.length; i++) {
        await admin
          .from('contest_teams')
          .update({ total_points: updates[i].total_points, rank: i + 1 })
          .eq('id', updates[i].id)
        teamsUpdated++
      }
    }
  }

  console.log(`[recalculate-points] rows updated: ${rowsUpdated}, teams updated: ${teamsUpdated}, matches affected: ${affectedMatchIds.size}`)

  return NextResponse.json({ rowsUpdated, teamsUpdated, matchesAffected: affectedMatchIds.size })
}
