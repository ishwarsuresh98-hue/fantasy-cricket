import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── GET /api/contests/[id]/available-players ──────────────────────────────────
//
// Returns the confirmed playing XI for the gameweek contest.
// Players come from `match_playing_xi` (set by the admin sync), joined to the
// `players` table for name, role, price.
//
// Also returns recent form: average base_points across the player's last 3 matches.
//
// Response shape:
// {
//   confirmed: boolean,                    // false if match_playing_xi is empty
//   match: { id, number,opponent_team, date }, // the match this GW is for
//   players: PlayerWithForm[]
// }

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contestId } = await params
  const supabase = await createClient()

  // ── Load contest → gameweek → match ──────────────────────────────────────
  const { data: contest } = await supabase
    .from('contests')
    .select('id, gameweek_id')
    .eq('id', contestId)
    .single()

  if (!contest?.gameweek_id) {
    return NextResponse.json({ error: 'Not a gameweek contest' }, { status: 400 })
  }

  const { data: gw } = await supabase
    .from('gameweeks')
    .select('id, number, name, match_date, match_id')
    .eq('id', contest.gameweek_id)
    .single()

  if (!gw?.match_id) {
    return NextResponse.json({ confirmed: false, match: null, players: [] })
  }

  const { data: match } = await supabase
    .from('matches')
    .select('id, match_number, opponent_team, match_date, season_id')
    .eq('id', gw.match_id)
    .single()

  if (!match) return NextResponse.json({ confirmed: false, match: null, players: [] })

  // ── Playing XI for this match ─────────────────────────────────────────────
  const { data: xiRows } = await supabase
    .from('match_playing_xi')
    .select('player_id, players(id, name, role, price)')
    .eq('match_id', gw.match_id)

  if (!xiRows?.length) {
    return NextResponse.json({
      confirmed: false,
      match: { id: match.id, number: match.match_number,opponent_team: match.opponent_team, date: match.match_date },
      players: [],
    })
  }

  // ── Recent form: avg base_points over last 3 matches ─────────────────────
  const playerIds = xiRows.map(r => r.player_id as string)

  const { data: recentPerfs } = await supabase
    .from('match_performances')
    .select('player_id, base_points, match_id')
    .in('player_id', playerIds)
    .order('match_id', { ascending: false })

  // Group by player, take last 3
  const formMap: Record<string, number[]> = {}
  for (const perf of recentPerfs ?? []) {
    const pid = perf.player_id as string
    if (!formMap[pid]) formMap[pid] = []
    if (formMap[pid].length < 3) formMap[pid].push(Number(perf.base_points))
  }

  type PlayerRow = {
    id: string; name: string; role: string; price: number
    avg_points: number; last_points: number | null; form: 'up' | 'down' | 'neutral'
  }

  const players: PlayerRow[] = xiRows.map(xi => {
    const playerData = xi.players as unknown as Record<string, unknown> | null
    const pid        = xi.player_id as string
    const form       = formMap[pid] ?? []
    const avg        = form.length ? Math.round(form.reduce((a, b) => a + b, 0) / form.length * 10) / 10 : 0
    const last       = form[0] ?? null
    const prev       = form[1] ?? null
    const trend: 'up' | 'down' | 'neutral' =
      last != null && prev != null ? (last > prev ? 'up' : last < prev ? 'down' : 'neutral') : 'neutral'

    return {
      id:          pid,
      name:        (playerData?.name ?? '') as string,
      role:        (playerData?.role ?? '') as string,
      price:       Number(playerData?.price ?? 0),
      avg_points:  avg,
      last_points: last,
      form:        trend,
    }
  }).filter(p => p.name)
    .sort((a, b) => {
      const roleOrder: Record<string, number> = { wicket_keeper: 0, batsman: 1, all_rounder: 2, bowler: 3 }
      return (roleOrder[a.role] ?? 4) - (roleOrder[b.role] ?? 4) || b.price - a.price
    })

  return NextResponse.json({
    confirmed: true,
    match: { id: match.id, number: match.match_number,opponent_team: match.opponent_team, date: match.match_date },
    players,
  })
}
