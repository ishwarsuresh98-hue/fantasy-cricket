import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMatches, parsePCDate, isSloughTeam } from '@/lib/playcricket'

// ── POST /api/sync/matches ────────────────────────────────────────────────────
//
// Fetches matches from Play Cricket for the current season and upserts them
// into the `matches` table.
//
// Body: { season_id: string, season_year?: string, site_id?: string }
// Requires admin role.

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    season_id:   string
    season_year?: string
    site_id?:    string
  }

  if (!body.season_id) return NextResponse.json({ error: 'season_id required' }, { status: 400 })

  // ── Fetch current match count to number new matches ───────────────────────
  const admin = createAdminClient()

  const { count: existingCount } = await admin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', body.season_id)

  // ── Pull matches from Play Cricket ────────────────────────────────────────
  let pcMatches
  try {
    pcMatches = await getMatches(body.site_id, body.season_year)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  // Filter to Slough's matches only (exclude friendlies / cup matches if needed)
  const sloughMatches = pcMatches.filter(
    m => isSloughTeam(m.home_team_name) || isSloughTeam(m.away_team_name)
  )

  if (sloughMatches.length === 0) {
    return NextResponse.json({ imported: 0, updated: 0, message: 'No Slough matches found on Play Cricket for this season' })
  }

  // ── Existing matches to detect updates vs new ─────────────────────────────
  const { data: existing } = await admin
    .from('matches')
    .select('id, play_cricket_id, match_number')
    .eq('season_id', body.season_id)

  const byPcId: Record<string, { id: string; match_number: number }> = {}
  for (const m of existing ?? []) {
    if (m.play_cricket_id) byPcId[m.play_cricket_id] = { id: m.id, match_number: m.match_number }
  }

  let imported = 0
  let updated  = 0
  let matchNum = (existingCount ?? 0) + 1

  for (const m of sloughMatches) {
    const matchDate  = parsePCDate(m.match_date)
    const isHome     = isSloughTeam(m.home_team_name)
    const opponent   = isHome ? m.away_club_name : m.home_club_name
    const isComplete = m.status === 'Completed'
    const status     = isComplete ? 'completed' : 'upcoming'

    const payload = {
      season_id:        body.season_id,
      opponent:         opponent.replace(/- \d+st XI|- \d+nd XI|- \d+rd XI|- \d+th XI/i, '').trim(),
      match_date:       matchDate,
      venue:            m.ground_name || null,
      status,
      result:           isComplete ? (m.result_description || null) : null,
      play_cricket_id:  m.id,
    }

    if (byPcId[m.id]) {
      // Update existing
      await admin.from('matches').update(payload).eq('id', byPcId[m.id].id)
      updated++
    } else {
      // Insert new
      await admin.from('matches').insert({ ...payload, match_number: matchNum })
      matchNum++
      imported++
    }
  }

  return NextResponse.json({ ok: true, imported, updated, total: sloughMatches.length })
}
