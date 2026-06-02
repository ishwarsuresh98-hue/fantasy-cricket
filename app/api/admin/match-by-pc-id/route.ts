import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMatchDetail, isSloughTeam } from '@/lib/playcricket'
import { renumberMatches } from '@/lib/matches'

function parsePlayCricketDate(dateStr: string | null | undefined): string {
  if (!dateStr) return new Date().toISOString()
  // Handle DD/MM/YYYY format from Play Cricket
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    const [day, month, year] = parts
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  return dateStr
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const pc_id = new URL(req.url).searchParams.get('pc_id')
  if (!pc_id) return NextResponse.json({ error: 'pc_id required' }, { status: 400 })

  const admin = createAdminClient()

  // 1. Check if match already exists in DB
  const { data: existing } = await admin
    .from('matches')
    .select('id, opponent_team, match_date')
    .eq('play_cricket_id', pc_id)
    .single()

  if (existing) return NextResponse.json({ data: existing })

  // 2. Match not in DB — fetch from Play Cricket and create it
  let detail
  try {
    detail = await getMatchDetail(pc_id)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  if (!detail) return NextResponse.json({ error: 'Match not found on Play Cricket' }, { status: 404 })

  // 3. Get active season
  const { data: season } = await admin
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .single()

  if (!season) return NextResponse.json({ error: 'No active season found' }, { status: 400 })

  // 4. Determine our_team, opponent_team, date, venue, result, status
  const homeIsSlough  = isSloughTeam(detail.home_team_name) || isSloughTeam(detail.home_club_name)
  const sloughTeam    = homeIsSlough ? detail.home_team_name : detail.away_team_name
  const oppClubName   = homeIsSlough ? detail.away_club_name : detail.home_club_name
  const oppTeamName   = homeIsSlough ? detail.away_team_name : detail.home_team_name
  const our_team      = `Slough CC - ${sloughTeam.replace(/^.*?-\s*/i, '').trim()}`
  const opponent_team = `${oppClubName} - ${oppTeamName.replace(/^.*?-\s*/i, '').trim()}`
  const matchDate     = parsePlayCricketDate(detail.match_date)
  const venue         = detail.ground_name || null
  const result        = detail.result_description || null
  const status        = result ? 'completed' : 'upcoming'

  // 5. Get next match number
  const { data: lastMatch } = await admin
    .from('matches')
    .select('match_number')
    .eq('season_id', season.id)
    .order('match_number', { ascending: false })
    .limit(1)
    .single()

  const nextNumber = (lastMatch?.match_number ?? 0) + 1

  // 6. Insert new match — only columns that exist in the schema
  const { data: newMatch, error: insertErr } = await admin
    .from('matches')
    .insert({
      season_id:       season.id,
      match_number:    nextNumber,
      our_team,
      opponent_team,
      match_date:      matchDate,
      venue,
      result,
      status,
      play_cricket_id: pc_id,
    })
    .select('id, opponent_team, match_date')
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Renumber all season matches by date so the new row slots in correctly
  await renumberMatches(admin, season.id)

  return NextResponse.json({ data: newMatch, created: true })
}
