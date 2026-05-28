import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMatchDetail, isSloughTeam, oversToBalls } from '@/lib/playcricket'
import { computeBasePoints } from '@/lib/scoring'

// ── POST /api/sync/live ───────────────────────────────────────────────────────
//
// Called by the cron job every 5 minutes on match days.
// For every match currently in 'live' status, fetches the latest scorecard
// from Play Cricket, updates match_performances with running totals, then
// recalculates contest_team points and broadcasts via Supabase realtime.
//
// Body: {} (empty — finds live matches automatically)
// Accepts either admin session or CRON_SECRET header for cron invocations.

const CRON_SECRET = process.env.CRON_SECRET ?? ''

export async function POST(req: Request) {
  // Auth: either admin user session or cron secret header
  const cronHeader = req.headers.get('x-cron-secret')
  if (cronHeader && CRON_SECRET && cronHeader !== CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!cronHeader) {
    // Manual trigger — require admin session
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  // ── Find all live matches ─────────────────────────────────────────────────
  const { data: liveMatches } = await admin
    .from('matches')
    .select('id, season_id, play_cricket_id, opponent')
    .eq('status', 'live')

  if (!liveMatches?.length) {
    return NextResponse.json({ ok: true, message: 'No live matches right now' })
  }

  const results: Record<string, unknown>[] = []

  for (const match of liveMatches) {
    const pcMatchId = match.play_cricket_id as string | null
    if (!pcMatchId) {
      results.push({ match_id: match.id, error: 'No play_cricket_id set on match' })
      continue
    }

    let detail
    try {
      detail = await getMatchDetail(pcMatchId)
    } catch (e: unknown) {
      results.push({ match_id: match.id, error: (e as Error).message })
      continue
    }

    if (!detail?.innings?.length) {
      results.push({ match_id: match.id, error: 'No innings data yet' })
      continue
    }

    // ── Load season players ───────────────────────────────────────────────
    const { data: seasonPlayers } = await admin
      .from('players').select('id, name').eq('season_id', match.season_id).eq('is_active', true)

    function normName(n: string) {
      return n.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
    }

    const playerByNorm: Record<string, string> = {}
    for (const p of seasonPlayers ?? []) {
      playerByNorm[normName(p.name)] = p.id
      const parts = normName(p.name).split(' ')
      if (parts.length > 1 && !playerByNorm[parts[parts.length - 1]])
        playerByNorm[parts[parts.length - 1]] = p.id
    }

    const homeIsSlough = isSloughTeam(detail.home_team_name)
    const sloughTeamId = homeIsSlough ? detail.home_team_id : detail.away_team_id

    // Accumulate live performances
    type PerfAcc = {
      player_id: string; match_id: string; runs_scored: number; balls_faced: number
      fours: number; sixes: number; did_not_bat: boolean; wickets: number
      catches: number; stumpings: number; run_outs: number; dot_balls: number
      maidens: number; base_points: number
    }

    const perfMap: Record<string, PerfAcc> = {}
    function getPerf(pid: string): PerfAcc {
      if (!perfMap[pid]) perfMap[pid] = {
        player_id: pid, match_id: match.id,
        runs_scored: 0, balls_faced: 0, fours: 0, sixes: 0, did_not_bat: true,
        wickets: 0, catches: 0, stumpings: 0, run_outs: 0, dot_balls: 0,
        maidens: 0, base_points: 0,
      }
      return perfMap[pid]
    }

    for (const innings of detail.innings) {
      const sloughBatting = innings.team_batting_id === sloughTeamId

      if (sloughBatting && innings.bat) {
        for (const b of innings.bat) {
          const pid = playerByNorm[normName(b.batsman_name)]
          if (!pid) continue
          const p = getPerf(pid)
          const howOut = b.how_out?.toLowerCase() ?? ''
          if (!/did\s*not\s*bat|dnb|absent/i.test(howOut)) p.did_not_bat = false
          p.runs_scored += parseInt(b.runs, 10) || 0
          p.balls_faced += parseInt(b.balls, 10) || 0
          p.fours       += parseInt(b.fours, 10) || 0
          p.sixes       += parseInt(b.sixes, 10) || 0
        }
      }

      if (!sloughBatting && innings.bowl) {
        for (const bw of innings.bowl) {
          const pid = playerByNorm[normName(bw.bowler_name)]
          if (!pid) continue
          const p = getPerf(pid)
          p.wickets += parseInt(bw.wickets, 10) || 0
          p.maidens += parseInt(bw.maidens, 10) || 0
          const balls = oversToBalls(bw.overs)
          const runs  = parseInt(bw.runs, 10) || 0
          p.dot_balls += Math.max(0, balls - runs)
        }
      }

      if (!sloughBatting && innings.bat) {
        for (const b of innings.bat) {
          const howOut  = b.how_out?.toLowerCase() ?? ''
          const fielder = b.fielder_name?.trim() ?? ''
          if (!fielder) continue
          const pid = playerByNorm[normName(fielder)]
          if (!pid) continue
          const p = getPerf(pid)
          if (/^st\b/i.test(howOut))           p.stumpings += 1
          else if (/^c\b|caught/i.test(howOut)) p.catches   += 1
          else if (/^run\s*out/i.test(howOut))  p.run_outs  += 1
        }
      }
    }

    for (const perf of Object.values(perfMap)) perf.base_points = computeBasePoints(perf)

    const rows = Object.values(perfMap)
    if (rows.length > 0) {
      await admin.from('match_performances').upsert(rows, { onConflict: 'match_id,player_id' })
    }

    // ── Recalculate contest team points and broadcast ──────────────────────
    const { data: directContests } = await admin.from('contests').select('id').eq('match_id', match.id)
    const { data: gw }             = await admin.from('gameweeks').select('id').eq('match_id', match.id).maybeSingle()
    const gwContests = gw ? (await admin.from('contests').select('id').eq('gameweek_id', gw.id)).data ?? [] : []
    const allContestIds = [...(directContests ?? []), ...gwContests].map(c => c.id)

    let teamsUpdated = 0
    for (const cid of allContestIds) {
      const { data: teams } = await admin.from('contest_teams').select('id, players').eq('contest_id', cid)
      if (!teams?.length) continue

      const updates = teams.map(ct => {
        const picks = (ct.players ?? []) as { player_id: string; is_captain: boolean; is_vice_captain: boolean }[]
        let total = 0
        for (const pick of picks) {
          const base = perfMap[pick.player_id] ? computeBasePoints(perfMap[pick.player_id]) : 0
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

    // ── Broadcast via Supabase realtime (channel: live-match-{matchId}) ────
    // This triggers ContestLobby / leaderboard components to re-render.
    await admin.channel(`live-match-${match.id}`).send({
      type: 'broadcast',
      event: 'points-updated',
      payload: { match_id: match.id, ts: Date.now() },
    })

    results.push({ match_id: match.id, players: rows.length, teams: teamsUpdated })
  }

  return NextResponse.json({ ok: true, matches_synced: liveMatches.length, results })
}
