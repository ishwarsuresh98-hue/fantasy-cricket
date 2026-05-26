import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── GET /api/contests ──────────────────────────────────────────────────────────
// Query params: match_id, season_id (at least one required)
export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const matchId  = searchParams.get('match_id')
  const seasonId = searchParams.get('season_id')

  if (!matchId && !seasonId) {
    return NextResponse.json(
      { error: 'At least one of match_id or season_id is required' },
      { status: 400 },
    )
  }

  let query = supabase
    .from('contests')
    .select('*')
    .order('entry_fee', { ascending: false })   // paid first
    .order('prize_pool', { ascending: false })
    .order('created_at', { ascending: false })

  if (matchId)  query = query.eq('match_id',  matchId)
  if (seasonId) query = query.eq('season_id', seasonId)

  const { data: contests, error } = await query
  if (error) {
    console.error('[api/contests] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!contests?.length) return NextResponse.json({ contests: [] })

  // ── Entry counts + "has my team joined?" ──────────────────────────────────
  const contestIds = contests.map((c) => c.id)

  // User's fantasy team for this season
  const seasonIdForQuery = seasonId ?? contests[0]?.season_id
  const { data: myTeam } = seasonIdForQuery
    ? await supabase
        .from('fantasy_teams')
        .select('id')
        .eq('season_id', seasonIdForQuery)
        .eq('user_id', user.id)
        .maybeSingle()
    : { data: null }

  const { data: allEntries } = await supabase
    .from('contest_entries')
    .select('contest_id, fantasy_team_id')
    .in('contest_id', contestIds)

  const entryCountMap: Record<string, number>  = {}
  const joinedSet = new Set<string>()

  for (const e of allEntries ?? []) {
    entryCountMap[e.contest_id] = (entryCountMap[e.contest_id] ?? 0) + 1
    if (myTeam && e.fantasy_team_id === myTeam.id) {
      joinedSet.add(e.contest_id)
    }
  }

  const enriched = contests.map((c) => ({
    ...c,
    entry_count: entryCountMap[c.id] ?? 0,
    is_joined:   joinedSet.has(c.id),
  }))

  return NextResponse.json({ contests: enriched })
}

// ── POST /api/contests — admin creates a contest ───────────────────────────────
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: {
    season_id?:        string
    match_id?:         string
    name?:             string
    type?:             'public' | 'private'
    contest_category?: string
    entry_fee?:        number
    prize_pool?:       number
    max_teams?:        number
    prize_description?: string
    guaranteed_prize?: boolean
    entry_code?:       string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.season_id || !body.name || !body.type) {
    return NextResponse.json(
      { error: 'season_id, name and type are required' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('contests')
    .insert({
      season_id:         body.season_id,
      match_id:          body.match_id          ?? null,
      name:              body.name.trim(),
      type:              body.type,
      contest_category:  body.contest_category  ?? 'small_league',
      entry_fee:         body.entry_fee         ?? 0,
      prize_pool:        body.prize_pool        ?? 0,
      max_teams:         body.max_teams         ?? 100,
      prize_description: body.prize_description ?? null,
      guaranteed_prize:  body.guaranteed_prize  ?? false,
      entry_code:        body.entry_code        ?? null,
      created_by:        user.id,
    })
    .select()
    .single()

  if (error) {
    console.error('[api/contests] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ contest: data }, { status: 201 })
}
