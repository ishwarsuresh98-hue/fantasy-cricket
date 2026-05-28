import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMatches, parsePCDate, isSloughTeam, isYouthMatch } from '@/lib/playcricket'

// ── POST /api/sync/matches ────────────────────────────────────────────────────
//
// Fetches matches from Play Cricket for the current season and upserts them
// into the `matches` table.
//
// Body: { season_id: string, season_year?: string, site_id?: string }
// Requires admin role.
//
// Response:
//   fetched  — total matches returned by the Play Cricket API
//   filtered — matches removed (colts/youth keywords)
//   imported — new matches inserted
//   updated  — existing matches updated (status, result, play_cricket_id stamped)
//   skipped  — existing matches with no changes needed

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    season_id:    string
    season_year?: string
    site_id?:     string
  }

  if (!body.season_id) return NextResponse.json({ error: 'season_id required' }, { status: 400 })

  const admin = createAdminClient()

  // ── Pull matches from Play Cricket ────────────────────────────────────────
  let pcMatches
  try {
    pcMatches = await getMatches(body.site_id, body.season_year)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  const fetched = pcMatches.length

  // ── Apply youth/colts filter ──────────────────────────────────────────────
  const sloughAll     = pcMatches.filter(m => isSloughTeam(m.home_team_name) || isSloughTeam(m.away_team_name))
  const sloughSenior  = sloughAll.filter(m => !isYouthMatch(m))
  const filtered      = sloughAll.length - sloughSenior.length  // how many were cut

  if (sloughSenior.length === 0) {
    return NextResponse.json({
      ok: true, fetched, filtered,
      imported: 0, updated: 0, skipped: 0,
      message: 'No senior Slough matches found on Play Cricket for this season',
    })
  }

  // ── Load existing matches for this season ─────────────────────────────────
  const { data: existing } = await admin
    .from('matches')
    .select('id, play_cricket_id, match_number, match_date, opponent, status, result')
    .eq('season_id', body.season_id)

  // Index 1: by play_cricket_id (fastest — already linked from a previous sync)
  const byPcId: Record<string, typeof existing extends (infer T)[] | null ? T : never> = {}
  // Index 2: by "date|opponent" for matches imported manually (no play_cricket_id yet)
  const byDateOpponent: Record<string, typeof existing extends (infer T)[] | null ? T : never> = {}

  for (const m of existing ?? []) {
    if (m.play_cricket_id) byPcId[m.play_cricket_id] = m
    const normOpp  = (m.opponent as string).toLowerCase().replace(/[^a-z0-9]/g, '')
    const dateKey  = `${m.match_date as string}|${normOpp}`
    byDateOpponent[dateKey] = m
  }

  // Running match_number for brand-new inserts
  const maxNumber = (existing ?? []).reduce((max, m) => Math.max(max, m.match_number as number), 0)
  let nextMatchNum = maxNumber + 1

  let imported = 0
  let updated  = 0
  let skipped  = 0

  for (const m of sloughSenior) {
    const matchDate   = parsePCDate(m.match_date)
    const isHome      = isSloughTeam(m.home_team_name)
    const rawOpponent = isHome ? m.away_club_name : m.home_club_name
    const opponent    = rawOpponent.replace(/\s*-\s*\d+\w*\s*XI\s*/i, '').trim()
    const isComplete  = m.status === 'Completed'
    const status      = isComplete ? 'completed' : 'upcoming'
    const result      = isComplete ? (m.result_description || null) : null

    const payload = {
      season_id:       body.season_id,
      opponent,
      match_date:      matchDate,
      venue:           m.ground_name || null,
      status,
      result,
      play_cricket_id: m.id,
    }

    // ── Try to find an existing row ───────────────────────────────────────
    const byId = byPcId[m.id]
    const normOpp = opponent.toLowerCase().replace(/[^a-z0-9]/g, '')
    const dateKey = `${matchDate}|${normOpp}`
    const byDate  = !byId ? byDateOpponent[dateKey] : undefined

    const existingRow = byId ?? byDate

    if (existingRow) {
      // Determine whether anything actually changed
      const changed =
        existingRow.status         !== status      ||
        (existingRow.result ?? null) !== result    ||
        (existingRow.play_cricket_id ?? null) !== m.id   // stamp PC id if missing

      if (changed) {
        await admin.from('matches').update(payload).eq('id', existingRow.id as string)
        updated++
      } else {
        skipped++
      }
    } else {
      // Brand-new match
      await admin.from('matches').insert({ ...payload, match_number: nextMatchNum })
      nextMatchNum++
      imported++
    }
  }

  return NextResponse.json({
    ok:       true,
    fetched,
    filtered,
    imported,
    updated,
    skipped,
  })
}
