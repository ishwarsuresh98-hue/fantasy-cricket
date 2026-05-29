import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMatches, getMatchDetail, parsePCDate, isSloughTeam, isYouthMatch } from '@/lib/playcricket'
import { broadcastPush } from '@/lib/push'

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

// ── Opponent name normalisation ───────────────────────────────────────────────
//
// Play Cricket returns names like "Harefield CC, Middx - 1st XI".
// Our DB may store "Harefield CC" or "Harefield Cricket Club".
// We reduce both to a bag of meaningful words so fuzzy matching works.

const STRIP_SUFFIXES = /\s*[-,]\s*(1st|2nd|3rd|\d+th)\s*XI\b.*/i
const STRIP_AFTER_DASH = /\s+-\s+.*/   // " - Middx" etc., only after initial stripping
const STRIP_NOISE = /\b(cc|cricket\s+club|cricket|fc|afc|rfc|the|&|and)\b/gi
const STRIP_ROMAN = /\b(i{1,3}|iv|vi{0,3}|ix|xi{0,2}|x{1,3})\b/gi
const STRIP_XI    = /\b\d*\s*(1st|2nd|3rd|\d+th)\s*xi\b/gi

/** Reduce a club name to a sorted array of meaningful lowercase words. */
function normWords(raw: string): string[] {
  let s = raw
  s = s.replace(STRIP_SUFFIXES, '')   // strip "- 1st XI" and everything after
  s = s.replace(STRIP_AFTER_DASH, '') // strip " - County" suffixes
  s = s.replace(STRIP_XI, '')         // strip standalone XI references
  s = s.replace(STRIP_ROMAN, '')      // strip roman numerals
  s = s.replace(STRIP_NOISE, '')      // strip noise words
  s = s.replace(/[^a-z0-9\s]/gi, ' ').toLowerCase()
  return s.split(/\s+/).filter(w => w.length > 1).sort()
}

/** Jaccard-style word overlap ratio between two name strings. */
function wordSimilarity(a: string, b: string): number {
  const wa = new Set(normWords(a))
  const wb = new Set(normWords(b))
  if (wa.size === 0 && wb.size === 0) return 1
  if (wa.size === 0 || wb.size === 0) return 0
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared / Math.max(wa.size, wb.size)
}

const FUZZY_THRESHOLD = 0.6   // 60% word overlap → same club

// ── Route ─────────────────────────────────────────────────────────────────────

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
  const sloughAll    = pcMatches.filter(m => isSloughTeam(m.home_team_name) || isSloughTeam(m.away_team_name))
  const sloughSenior = sloughAll.filter(m => !isYouthMatch(m))
  const filtered     = sloughAll.length - sloughSenior.length

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

  type ExistingRow = NonNullable<typeof existing>[number]

  // Index by play_cricket_id — fastest, used when already linked
  const byPcId = new Map<string, ExistingRow>()
  for (const m of existing ?? []) {
    if (m.play_cricket_id) byPcId.set(m.play_cricket_id as string, m)
  }

  // Group existing rows by date so fuzzy matching only compares same-day rows
  const byDate = new Map<string, ExistingRow[]>()
  for (const m of existing ?? []) {
    const date = m.match_date as string
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date)!.push(m)
  }

  const maxNumber = (existing ?? []).reduce((max, m) => Math.max(max, m.match_number as number), 0)
  let nextMatchNum = maxNumber + 1

  let imported = 0
  let updated  = 0
  let skipped  = 0

  for (const m of sloughSenior) {
    const matchDate   = parsePCDate(m.match_date)
    const isHome      = isSloughTeam(m.home_team_name)
    const rawOpponent = isHome ? m.away_club_name : m.home_club_name
    // Canonical name stored in DB: strip XI / county / suffix noise
    const opponent    = rawOpponent
      .replace(STRIP_SUFFIXES, '')
      .replace(STRIP_AFTER_DASH, '')
      .trim()

    const isComplete = m.status === 'Completed'
    const status     = isComplete ? 'completed' : 'upcoming'
    const result     = isComplete ? (m.result_description || null) : null

    const payload = {
      season_id:       body.season_id,
      opponent,
      match_date:      matchDate,
      venue:           m.ground_name || null,
      status,
      result,
      play_cricket_id: m.id,
    }

    // ── Match lookup: pcId → exact date+name → fuzzy date+name ───────────
    let existingRow: ExistingRow | undefined = byPcId.get(m.id)

    if (!existingRow) {
      // Try same-date rows with fuzzy name matching
      const sameDay = byDate.get(matchDate) ?? []
      let bestScore = 0
      for (const row of sameDay) {
        const score = wordSimilarity(rawOpponent, row.opponent as string)
        if (score > bestScore) { bestScore = score; existingRow = row }
      }
      if (bestScore < FUZZY_THRESHOLD) existingRow = undefined
    }

    if (existingRow) {
      const changed =
        existingRow.status !== status ||
        (existingRow.result ?? null) !== result ||
        (existingRow.play_cricket_id ?? null) !== m.id

      if (changed) {
        await admin.from('matches').update(payload).eq('id', existingRow.id as string)
        updated++
      } else {
        skipped++
      }
    } else {
      await admin.from('matches').insert({ ...payload, match_number: nextMatchNum })
      nextMatchNum++
      imported++
    }
  }

  // ── Auto-sync playing XIs for upcoming matches ────────────────────────────
  // After the fixture sync, check every upcoming match that now has a
  // play_cricket_id. If Play Cricket already has a confirmed team sheet
  // (players in match_detail), auto-sync the XI and push a notification
  // to admin users so they know the squad is locked in.

  const today = new Date().toISOString().split('T')[0]

  // Load all upcoming matches for this season — including those where
  // play_cricket_id was just stamped on by the upsert loop above so that
  // newly-linked matches are picked up for XI auto-sync in the same request.
  const { data: upcomingRows } = await admin
    .from('matches')
    .select('id, match_number, opponent, match_date, play_cricket_id, season_id')
    .eq('season_id', body.season_id)
    .gte('match_date', today)
    .order('match_date', { ascending: true })

  const upcoming = upcomingRows ?? []

  if (upcoming.length === 0) {
    return NextResponse.json({ ok: true, fetched, filtered, imported, updated, skipped, auto_xi_synced: 0, xi_details: [] })
  }

  // Which matches already have XI rows in the DB?
  const upcomingIds = upcoming.map(m => m.id as string)
  const { data: existingXiRows } = await admin
    .from('match_playing_xi')
    .select('match_id')
    .in('match_id', upcomingIds)

  const matchesWithXi = new Set((existingXiRows ?? []).map(r => r.match_id as string))

  // Load season players once (shared across all auto-XI syncs below)
  const { data: seasonPlayers } = await admin
    .from('players')
    .select('id, name')
    .eq('season_id', body.season_id)
    .eq('is_active', true)

  function normName(n: string) {
    return n.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
  }

  const playerByNorm: Record<string, string> = {}
  for (const p of seasonPlayers ?? []) {
    playerByNorm[normName(p.name)] = p.id
    const parts = normName(p.name).split(' ')
    if (parts.length > 1) {
      const lastName = parts[parts.length - 1]
      if (!playerByNorm[lastName]) playerByNorm[lastName] = p.id
    }
  }

  interface XiDetail {
    match_id:   string
    match_label: string
    matched:    number
    unmatched:  number
    newly_confirmed: boolean
  }

  let auto_xi_synced = 0
  const xi_details: XiDetail[] = []

  for (const match of upcoming) {
    const pcId = match.play_cricket_id as string | null
    if (!pcId) continue   // no PC link yet — nothing to look up

    const alreadyHadXi = matchesWithXi.has(match.id as string)

    let detail
    try {
      detail = await getMatchDetail(pcId)
    } catch {
      // Network / API error for one match — skip, don't abort the whole response
      continue
    }

    if (!detail?.players) continue  // XI not published yet

    const homeIsSlough = isSloughTeam(detail.home_team_name)
    const sloughPlayers = homeIsSlough
      ? (detail.players.home_team ?? [])
      : (detail.players.away_team ?? [])

    if (sloughPlayers.length === 0) continue

    // Resolve player IDs
    const rows: { match_id: string; player_id: string }[] = []
    const unmatched: string[] = []
    for (const pcPlayer of sloughPlayers) {
      const norm = normName(pcPlayer.name)
      const pid  = playerByNorm[norm]
      if (pid) {
        rows.push({ match_id: match.id as string, player_id: pid })
      } else {
        unmatched.push(pcPlayer.name)
      }
    }

    if (rows.length === 0) continue

    // Clear old rows and insert fresh ones
    await admin.from('match_playing_xi').delete().eq('match_id', match.id as string)
    await admin.from('match_playing_xi').insert(rows)

    const matchLabel = `Match ${match.match_number as number} vs ${match.opponent as string} (${match.match_date as string})`

    xi_details.push({
      match_id:        match.id as string,
      match_label:     matchLabel,
      matched:         rows.length,
      unmatched:       unmatched.length,
      newly_confirmed: !alreadyHadXi,
    })

    if (!alreadyHadXi) {
      auto_xi_synced++

      // Push notification to all admin users
      try {
        // Find admin user IDs so we broadcast only to admins
        const { data: admins } = await admin
          .from('profiles')
          .select('id')
          .eq('role', 'admin')

        const adminIds = (admins ?? []).map(a => a.id as string)

        for (const adminId of adminIds) {
          await broadcastPush({
            payload: {
              title: '🏏 Team sheet confirmed!',
              body:  `The playing XI for ${match.opponent as string} on ${match.match_date as string} has been imported from Play Cricket.`,
              url:   `/clubs/admin/sync`,
              type:  'xi_confirmed',
            },
            userId: adminId,
          })
        }
      } catch {
        // Push failure must not break the sync response
      }
    }
  }

  return NextResponse.json({ ok: true, fetched, filtered, imported, updated, skipped, auto_xi_synced, xi_details })
}
