import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMatchDetail, isSloughTeam } from '@/lib/playcricket'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as { match_id?: string; pc_match_id?: string }
  if (!body.match_id || !body.pc_match_id) {
    return NextResponse.json({ error: 'match_id and pc_match_id are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: match } = await admin
    .from('matches')
    .select('id, season_id, opponent')
    .eq('id', body.match_id)
    .single()

  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  let detail
  try {
    detail = await getMatchDetail(body.pc_match_id)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  if (!detail) return NextResponse.json({ error: 'Match not found on Play Cricket' }, { status: 404 })

  // Identify Slough team ID from innings
  const homeIsSlough = isSloughTeam(detail.home_club_name) || isSloughTeam(detail.home_team_name)
  const sloughTeamId = homeIsSlough ? detail.home_team_id : detail.away_team_id

  // Extract all Slough player names from batting + bowling innings
  const sloughPlayerNames = new Set<string>()

  for (const innings of detail.innings ?? []) {
    const sloughIsBatting = innings.team_batting_id === sloughTeamId
    const sloughIsBowling = innings.team_fielding_id === sloughTeamId

    if (sloughIsBatting && innings.bat) {
      for (const b of innings.bat) {
        if (b.batsman_name?.trim()) sloughPlayerNames.add(b.batsman_name.trim())
      }
    }
    if (sloughIsBowling && innings.bowl) {
      for (const b of innings.bowl) {
        if (b.bowler_name?.trim()) sloughPlayerNames.add(b.bowler_name.trim())
      }
    }
  }

  if (sloughPlayerNames.size === 0) {
    return NextResponse.json({ error: 'No Slough players found in scorecard innings data.' }, { status: 400 })
  }

  // Load season players for name matching
  const { data: seasonPlayers } = await admin
    .from('players')
    .select('id, name')
    .eq('season_id', match.season_id)
    .eq('is_active', true)

  function normName(n: string) {
    return n.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
  }

  const playerByNorm: Record<string, string> = {}
  for (const p of seasonPlayers ?? []) {
    playerByNorm[normName(p.name)] = p.id
    const parts = normName(p.name).split(' ')
    if (parts.length > 1 && !playerByNorm[parts[parts.length - 1]]) {
      playerByNorm[parts[parts.length - 1]] = p.id
    }
  }

  const matched:   string[] = []
  const unmatched: string[] = []
  const rows: { match_id: string; player_id: string }[] = []

  for (const name of sloughPlayerNames) {
    const pid = playerByNorm[normName(name)]
    if (pid) {
      rows.push({ match_id: body.match_id, player_id: pid })
      matched.push(name)
    } else {
      unmatched.push(name)
    }
  }

  if (rows.length > 0) {
    await admin.from('match_playing_xi').delete().eq('match_id', body.match_id)
    const { error } = await admin.from('match_playing_xi').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await admin.from('matches').update({ play_cricket_id: body.pc_match_id }).eq('id', body.match_id)

  return NextResponse.json({
    ok: true,
    matched: matched.length,
    unmatched: unmatched.length,
    matched_names: matched,
    unmatched_names: unmatched,
  })
}
