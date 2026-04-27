import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { matchId } = await request.json()
  if (!matchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 })

  const { data: match } = await supabase
    .from('matches').select('match_number, season_id').eq('id', matchId).single()
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  const [{ data: teams }, { data: matchSels }, { data: prevSels }] = await Promise.all([
    supabase.from('fantasy_teams').select('id, user_id, team_name, total_points').eq('season_id', match.season_id),
    supabase.from('fantasy_selections').select('fantasy_team_id, points_earned').eq('match_id', matchId),
    supabase.from('fantasy_selections').select('fantasy_team_id, match_id, points_earned').neq('match_id', matchId),
  ])

  if (!teams?.length) return NextResponse.json({ ok: true, generated: 0 })

  // Match points per team
  const matchPts: Record<string, number> = {}
  for (const s of matchSels ?? []) {
    matchPts[s.fantasy_team_id] = (matchPts[s.fantasy_team_id] ?? 0) + s.points_earned
  }

  // Previous best per team (per matchday)
  const prevByTeamMatch: Record<string, Record<string, number>> = {}
  for (const s of prevSels ?? []) {
    if (!prevByTeamMatch[s.fantasy_team_id]) prevByTeamMatch[s.fantasy_team_id] = {}
    prevByTeamMatch[s.fantasy_team_id][s.match_id] =
      (prevByTeamMatch[s.fantasy_team_id][s.match_id] ?? 0) + s.points_earned
  }

  // Ranks — new = sorted by total_points; old = sorted by (total - match_pts)
  const sortedNew = [...teams].sort((a, b) => b.total_points - a.total_points)
  const sortedOld = [...teams].sort((a, b) =>
    (b.total_points - (matchPts[b.id] ?? 0)) - (a.total_points - (matchPts[a.id] ?? 0))
  )
  const newRank: Record<string, number> = {}
  const oldRank: Record<string, number> = {}
  sortedNew.forEach((t, i) => { newRank[t.id] = i + 1 })
  sortedOld.forEach((t, i) => { oldRank[t.id] = i + 1 })

  const notifications: object[] = []

  for (const team of teams) {
    // Only notify teams that had selections for this match
    if (!(team.id in matchPts)) continue

    const pts = matchPts[team.id]
    const nr = newRank[team.id]
    const or = oldRank[team.id]
    const rankChange = or - nr  // positive = moved up

    // Previous best matchday score for this team
    const prevBests = Object.values(prevByTeamMatch[team.id] ?? {})
    const prevBest = prevBests.length > 0 ? Math.max(...prevBests) : 0
    const isBestYet = pts > prevBest && prevBests.length > 0

    let pointsBody = `You scored ${pts.toFixed(1)} points in Matchday ${match.match_number}.`
    if (isBestYet) pointsBody += ' Your best matchday score yet! 🌟'
    else if (prevBests.length === 0) pointsBody += ' Welcome to the season!'

    notifications.push({
      user_id: team.user_id,
      type: 'points_update',
      title: `Matchday ${match.match_number}: ${pts.toFixed(1)} pts`,
      body: pointsBody,
      metadata: { match_id: matchId, match_number: match.match_number, points: pts },
    })

    // Only create rank notification if rank actually changed and there are multiple teams
    if (rankChange !== 0 && teams.length > 1) {
      const abs = Math.abs(rankChange)
      const title = rankChange > 0
        ? `Moved up ${abs} place${abs !== 1 ? 's' : ''} to #${nr} 📈`
        : `Rank dropped to #${nr} 📉`
      const body = rankChange > 0
        ? `You climbed ${abs} place${abs !== 1 ? 's' : ''} to #${nr} after Matchday ${match.match_number}.`
        : `You dropped ${abs} place${abs !== 1 ? 's' : ''} to #${nr} after Matchday ${match.match_number}.`

      notifications.push({
        user_id: team.user_id,
        type: 'rank_change',
        title,
        body,
        metadata: { match_id: matchId, match_number: match.match_number, old_rank: or, new_rank: nr, change: rankChange },
      })
    }
  }

  if (notifications.length > 0) {
    const { error } = await supabase.from('notifications').insert(notifications)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, generated: notifications.length })
}
