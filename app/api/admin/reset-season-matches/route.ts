export const dynamic = 'force-dynamic'

import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMatches, parsePCDate, isSloughTeam, isYouthMatch } from '@/lib/playcricket'

// ── POST /api/admin/reset-season-matches ─────────────────────────────────────
//
// DESTRUCTIVE — deletes all matches for the given season, then re-imports
// a clean set from the Play Cricket API.
//
// Body: { season_id: string, season_year?: string, confirm: true }
//   confirm: true  — must be explicitly set to prevent accidental calls
//
// Returns: { deleted, imported, sample: first 5 rows }
// Requires admin role.

// ── Same normalisation helpers as sync/matches ────────────────────────────────
const STRIP_SUFFIXES  = /\s*[-,]\s*(1st|2nd|3rd|\d+th)\s*XI\b.*/i
const STRIP_AFTER_DASH = /\s+-\s+.*/

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    season_id?: string
    season_year?: string
    confirm?: boolean
  }

  if (!body.season_id)  return NextResponse.json({ error: 'season_id required' }, { status: 400 })
  if (!body.confirm)    return NextResponse.json({ error: 'Must pass confirm: true to proceed' }, { status: 400 })

  const admin = createAdminClient()

  // ── 1. Count then delete all matches for this season ─────────────────────
  const { count: beforeCount } = await admin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', body.season_id)

  const { error: delErr } = await admin
    .from('matches')
    .delete()
    .eq('season_id', body.season_id)

  if (delErr) return NextResponse.json({ error: `Delete failed: ${delErr.message}` }, { status: 500 })

  // ── 2. Fetch fresh fixtures from Play Cricket ─────────────────────────────
  let pcMatches
  try {
    pcMatches = await getMatches(undefined, body.season_year)
  } catch (e: unknown) {
    return NextResponse.json({
      error: `Deleted ${beforeCount ?? 0} matches but Play Cricket fetch failed: ${(e as Error).message}`,
    }, { status: 502 })
  }

  // Filter to senior Slough matches only
  const sloughAll    = pcMatches.filter(m => isSloughTeam(m.home_club_name) || isSloughTeam(m.away_club_name))
  const sloughSenior = sloughAll.filter(m => !isYouthMatch(m))

  // ── 3. Insert fresh rows ──────────────────────────────────────────────────
  let matchNum = 1
  const inserted: object[] = []

  for (const m of sloughSenior) {
    const matchDate     = parsePCDate(m.match_date)
    const isHome        = isSloughTeam(m.home_club_name) || isSloughTeam(m.home_team_name)
    const rawSloughTeam = isHome ? m.home_team_name : m.away_team_name
    const rawOppClub    = isHome ? m.away_club_name  : m.home_club_name
    const rawOppTeam    = isHome ? m.away_team_name  : m.home_team_name
    const oppXI         = rawOppTeam.replace(/^.*?-\s*/i, '').trim()

    const our_team      = `Slough CC - ${rawSloughTeam.replace(/^.*?-\s*/i, '').trim()}`
    const opponent_team = `${rawOppClub} - ${oppXI}`

    const isComplete  = m.status === 'Completed'
    const row = {
      season_id:       body.season_id,
      match_number:    matchNum++,
      our_team,
      opponent_team,
      match_date:      matchDate,
      venue:           m.ground_name || null,
      status:          isComplete ? 'completed' : 'upcoming',
      result:          isComplete ? (m.result_description || null) : null,
      play_cricket_id: m.id,
    }

    const { error: insErr } = await admin.from('matches').insert(row)
    if (!insErr) inserted.push(row)
  }

  // Strip STRIP_SUFFIXES / STRIP_AFTER_DASH from opponent_team for canonical name (kept for compat)
  const sample = inserted.slice(0, 5).map((r) => {
    const row = r as Record<string, unknown>
    return {
      match_number:    row.match_number,
      our_team:        row.our_team,
      opponent_team:   row.opponent_team,
      match_date:      row.match_date,
      play_cricket_id: row.play_cricket_id,
    }
  })

  return NextResponse.json({
    ok:      true,
    deleted: beforeCount ?? 0,
    imported: inserted.length,
    fetched_from_pc: sloughSenior.length,
    sample,
  })
}
