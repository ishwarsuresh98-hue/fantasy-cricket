import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMatchDetail, isSloughTeam } from '@/lib/playcricket'

// ── POST /api/sync/playing-xi ─────────────────────────────────────────────────
//
// Fetches the playing XI from Play Cricket for one match and upserts into
// `match_playing_xi`, matching PC player names to our `players` table.
//
// Body: { match_id: string, pc_match_id: string }
//   match_id    — our internal DB match UUID
//   pc_match_id — Play Cricket numeric match ID
// Requires admin role.

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

  // ── Load our match + season ───────────────────────────────────────────────
  const { data: match } = await admin
    .from('matches')
    .select('id, season_id, opponent')
    .eq('id', body.match_id)
    .single()

  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  // ── Fetch from Play Cricket ───────────────────────────────────────────────
  let detail
  try {
    detail = await getMatchDetail(body.pc_match_id)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  if (!detail) {
    return NextResponse.json({ error: 'Match not found on Play Cricket' }, { status: 404 })
  }

  // ── Identify Slough team (home or away) ───────────────────────────────────
  const homeIsSlough = isSloughTeam(detail.home_club_name) || isSloughTeam(detail.home_team_name)
  const sloughPlayers = homeIsSlough
    ? (detail.players?.home_team ?? [])
    : (detail.players?.away_team ?? [])

  if (sloughPlayers.length === 0) {
    return NextResponse.json({ error: 'No Slough players found in match detail. Check pc_match_id.' }, { status: 400 })
  }

  // ── Load all active players for this season ───────────────────────────────
  const { data: seasonPlayers } = await admin
    .from('players')
    .select('id, name')
    .eq('season_id', match.season_id)
    .eq('is_active', true)

  // Normalise for fuzzy matching
  function normName(n: string) {
    return n.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
  }

  const playerByNorm: Record<string, string> = {}  // normalised name → player_id
  for (const p of seasonPlayers ?? []) {
    playerByNorm[normName(p.name)] = p.id
    // Also index by last name only
    const parts = normName(p.name).split(' ')
    if (parts.length > 1) {
      const lastName = parts[parts.length - 1]
      if (!playerByNorm[lastName]) playerByNorm[lastName] = p.id
    }
  }

  const matched:   string[] = []
  const unmatched: string[] = []
  const rows: { match_id: string; player_id: string }[] = []

  for (const pcPlayer of sloughPlayers) {
    const norm      = normName(pcPlayer.name)
    const playerId  = playerByNorm[norm]

    if (playerId) {
      rows.push({ match_id: body.match_id, player_id: playerId })
      matched.push(pcPlayer.name)
    } else {
      unmatched.push(pcPlayer.name)
    }
  }

  // ── Upsert into match_playing_xi ──────────────────────────────────────────
  if (rows.length > 0) {
    // Clear existing first to handle replacements
    await admin.from('match_playing_xi').delete().eq('match_id', body.match_id)
    const { error } = await admin.from('match_playing_xi').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Store pc_match_id on the match row ────────────────────────────────────
  await admin.from('matches').update({ play_cricket_id: body.pc_match_id }).eq('id', body.match_id)

  return NextResponse.json({
    ok:        true,
    matched:   matched.length,
    unmatched: unmatched.length,
    matched_names:   matched,
    unmatched_names: unmatched,
  })
}
