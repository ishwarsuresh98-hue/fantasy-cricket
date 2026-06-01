import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMatches } from '@/lib/playcricket'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const matches = await getMatches(undefined, '2026')
    const sample = matches.slice(0, 3).map(m => ({
      id: m.id,
      home_club_name: m.home_club_name,
      away_club_name: m.away_club_name,
      home_team_name: m.home_team_name,
      away_team_name: m.away_team_name,
      match_date: m.match_date,
    }))
    return NextResponse.json({ total: matches.length, sample })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message })
  }
}
