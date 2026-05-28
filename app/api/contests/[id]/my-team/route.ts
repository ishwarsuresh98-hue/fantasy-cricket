import { NextResponse }  from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/contests/[id]/my-team
// Returns the authenticated user's contest_team for this contest (or null).

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contestId } = await params
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: contestTeam, error } = await supabase
    .from('contest_teams')
    .select('*')
    .eq('contest_id', contestId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[my-team] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ contest_team: contestTeam ?? null })
}
