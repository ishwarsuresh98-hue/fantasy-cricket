import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMatchDetail, isSloughTeam, oversToBalls } from '@/lib/playcricket'
import { computeBasePoints } from '@/lib/scoring'
import { renumberMatches }   from '@/lib/matches'
import type { MatchPerformance } from '@/types'

// ── POST /api/sync/results ────────────────────────────────────────────────────
//
// Fetches batting + bowling scorecards from Play Cricket for a completed match,
// calculates fantasy points for each Slough player, and upserts into
// `match_performances`. Then recalculates contest_team points for any GW contest
// tied to this match.
//
// Body: { match_id: string, pc_match_id?: string }
//   match_id    — our DB match UUID (must have play_cricket_id set, or pass pc_match_id)
//   pc_match_id — override if not yet stored on the match row
//
// Requires admin role.

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as { match_id?: string; pc_match_id?: string }
  if (!body.match_id) return NextResponse.json({ error: 'match_id required' }, { status: 400 })

  const admin = createAdminClient()

  // ── Load match ────────────────────────────────────────────────────────────
  const { data: match } = await admin
    .from('matches')
    .select('id, season_id, opponent, play_cricket_id, status')
    .eq('id', body.match_id)
    .single()

  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  const pcMatchId = body.pc_match_id ?? (match.play_cricket_id as string | null)
  if (!pcMatchId) {
    return NextResponse.json({
      error: 'No Play Cricket match ID. Pass pc_match_id in the request body or sync the match first.',
    }, { status: 400 })
  }

  // ── Fetch from Play Cricket ───────────────────────────────────────────────
  let detail
  try {
    detail = await getMatchDetail(pcMatchId)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  if (!detail) return NextResponse.json({ error: 'Match not found on Play Cricket' }, { status: 404 })
  if (!detail.innings?.length) {
    return NextResponse.json({ error: 'No innings data available — match may not be published yet' }, { status: 400 })
  }

  // ── Identify Slough's team ID ─────────────────────────────────────────────
  // Check both club name (more reliable) and team name as fallback
  const homeIsSlough  = isSloughTeam(detail.home_team_name) || isSloughTeam(detail.home_club_name)
  const sloughTeamId  = homeIsSlough ? detail.home_team_id : detail.away_team_id

  function normName(n: string) {
    return n.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
  }

  // ── Load players for name → id matching ──────────────────────────────────
  // Prefer match_playing_xi (confirmed squad) when available; fall back to
  // all active season players so the route still works before XI is synced.
  const { data: xiRows } = await admin
    .from('match_playing_xi')
    .select('player_id')
    .eq('match_id', body.match_id)

  let candidatePlayers: { id: string; name: string }[]

  if (xiRows && xiRows.length > 0) {
    // XI confirmed — only match against players who actually played
    const xiPlayerIds = xiRows.map(r => r.player_id as string)
    const { data: xiPlayers } = await admin
      .from('players')
      .select('id, name')
      .in('id', xiPlayerIds)
    candidatePlayers = xiPlayers ?? []
  } else {
    // No XI on record — fall back to all active season players
    const { data: seasonPlayers } = await admin
      .from('players')
      .select('id, name')
      .eq('season_id', match.season_id)
      .eq('is_active', true)
    candidatePlayers = seasonPlayers ?? []
  }

  const playerByNorm: Record<string, string> = {}
  for (const p of candidatePlayers) {
    playerByNorm[normName(p.name)] = p.id
    const parts = normName(p.name).split(' ')
    if (parts.length > 1 && !playerByNorm[parts[parts.length - 1]]) {
      playerByNorm[parts[parts.length - 1]] = p.id
    }
  }

  // ── Accumulate performance stats across all innings ───────────────────────
  type MutablePerf = Omit<MatchPerformance, 'id' | 'players' | 'base_points'> & {
    base_points: number
  }

  const perfMap: Record<string, MutablePerf> = {}  // player_id → stats

  function getPerf(playerId: string): MutablePerf {
    if (!perfMap[playerId]) {
      perfMap[playerId] = {
        match_id:     body.match_id!,
        player_id:    playerId,
        runs_scored:  0,
        balls_faced:  0,
        fours:        0,
        sixes:        0,
        did_not_bat:  true,
        wickets:      0,
        catches:      0,
        stumpings:    0,
        run_outs:     0,
        dot_balls:    0,
        maidens:      0,
        base_points:  0,
      }
    }
    return perfMap[playerId]
  }

  for (const innings of detail.innings) {
    const sloughIsBatting = innings.team_batting_id === sloughTeamId

    // ── Slough batting ────────────────────────────────────────────────────
    if (sloughIsBatting && innings.bat) {
      for (const batter of innings.bat) {
        const pid = playerByNorm[normName(batter.batsman_name)]
        if (!pid) continue

        const runs   = parseInt(batter.runs,  10) || 0
        const balls  = parseInt(batter.balls, 10) || 0
        const fours  = parseInt(batter.fours, 10) || 0
        const sixes  = parseInt(batter.sixes, 10) || 0
        const howOut = batter.how_out?.toLowerCase() ?? ''
        const dnb    = /did\s*not\s*bat|dnb|absent/i.test(howOut)

        const p = getPerf(pid)
        p.runs_scored += runs
        p.balls_faced += balls
        p.fours       += fours
        p.sixes       += sixes
        if (!dnb) p.did_not_bat = false
      }
    }

    // ── Slough bowling ────────────────────────────────────────────────────
    if (!sloughIsBatting && innings.bowl) {
      for (const bowler of innings.bowl) {
        const pid = playerByNorm[normName(bowler.bowler_name)]
        if (!pid) continue

        const p        = getPerf(pid)
        const balls    = oversToBalls(bowler.overs)
        const maidens  = parseInt(bowler.maidens, 10) || 0
        const wickets  = parseInt(bowler.wickets, 10) || 0

        p.wickets   += wickets
        p.maidens   += maidens
        // Approximate dot balls: balls bowled minus runs conceded
        // (not perfect — wides inflate run count, but best we can do from aggregates)
        const runsConceded = parseInt(bowler.runs, 10) || 0
        p.dot_balls += Math.max(0, balls - runsConceded)
      }
    }

    // ── Fielding: parse from opposition batting ────────────────────────────
    if (!sloughIsBatting && innings.bat) {
      for (const batter of innings.bat) {
        const howOut    = batter.how_out?.toLowerCase() ?? ''
        const fielder   = batter.fielder_name?.trim() ?? ''

        if (!fielder) continue

        const pid = playerByNorm[normName(fielder)]
        if (!pid) continue

        const p = getPerf(pid)
        if (/^st\b/i.test(howOut))          p.stumpings += 1
        else if (/^c\b|caught/i.test(howOut)) p.catches += 1
        else if (/^run\s*out/i.test(howOut))  p.run_outs += 1
      }
    }
  }

  // ── Calculate base_points for each player ─────────────────────────────────
  for (const perf of Object.values(perfMap)) {
    perf.base_points = computeBasePoints(perf)
  }

  const rows = Object.values(perfMap)

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Could not match any Slough players to the scorecard. Run Sync Playing XI first.' }, { status: 400 })
  }

  // ── Upsert match_performances ─────────────────────────────────────────────
  const { error: upsertErr } = await admin
    .from('match_performances')
    .upsert(rows, { onConflict: 'match_id,player_id' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  // ── Refresh match row with latest Play Cricket data ──────────────────────
  // Full match title: "Slough CC - 1st XI vs Harefield CC, Middx - 1st XI"
  const homeLabel     = `${detail.home_club_name} - ${detail.home_team_name}`
  const awayLabel     = `${detail.away_club_name} - ${detail.away_team_name}`
  const freshOpponent = `${homeLabel} vs ${awayLabel}`

  await admin
    .from('matches')
    .update({
      status:          'completed',
      play_cricket_id: pcMatchId,
      opponent:        freshOpponent,
      venue:           detail.ground_name || null,
      result:          detail.result_description || null,
    })
    .eq('id', body.match_id)

  // Renumber all season matches by date so ordering stays consistent
  await renumberMatches(admin, match.season_id as string)

  // ── Recalculate GW contest team points for this match ─────────────────────
  // Find contests linked to this match (direct or via gameweek)
  const { data: directContests } = await admin
    .from('contests')
    .select('id')
    .eq('match_id', body.match_id)

  // Gameweek contests
  const { data: gw } = await admin
    .from('gameweeks')
    .select('id')
    .eq('match_id', body.match_id)
    .maybeSingle()

  const gwContests = gw
    ? await admin.from('contests').select('id').eq('gameweek_id', gw.id).then(r => r.data ?? [])
    : []

  const allContestIds = [
    ...(directContests ?? []).map(c => c.id),
    ...gwContests.map(c => c.id),
  ]

  let teamsUpdated = 0
  for (const contestId of allContestIds) {
    // Inline points recalc (same logic as calc-gw-points route)
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
      await admin.from('contest_teams').update({ total_points: updates[i].total_points, rank: i + 1 }).eq('id', updates[i].id)
      teamsUpdated++
    }
  }

  return NextResponse.json({
    ok:            true,
    players_synced: rows.length,
    contests_updated: allContestIds.length,
    teams_updated:  teamsUpdated,
  })
}
