import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── POST /api/admin/matches/[id]/link-pc ─────────────────────────────────────
//
// Manually link a match row to its Play Cricket match ID so that Playing XI
// and Results sync can find it by pc_match_id without needing the fuzzy match.
//
// Body: { play_cricket_id: string }
// Requires admin role.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: matchId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as { play_cricket_id?: string }
  const pcId = body.play_cricket_id?.trim()
  if (!pcId) return NextResponse.json({ error: 'play_cricket_id is required' }, { status: 400 })

  const admin = createAdminClient()

  // Verify the match exists
  const { data: match } = await admin
    .from('matches')
    .select('id, match_number,opponent_team')
    .eq('id', matchId)
    .single()

  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  // Check no other match already uses this play_cricket_id
  const { data: clash } = await admin
    .from('matches')
    .select('id, match_number,opponent_team')
    .eq('play_cricket_id', pcId)
    .neq('id', matchId)
    .maybeSingle()

  if (clash) {
    return NextResponse.json({
      error: `play_cricket_id ${pcId} is already linked to Match ${clash.match_number as number} vs ${clash.opponent_team as string}`,
    }, { status: 409 })
  }

  const { error } = await admin
    .from('matches')
    .update({ play_cricket_id: pcId })
    .eq('id', matchId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok:              true,
    match_id:        matchId,
    play_cricket_id: pcId,
    match:           `Match ${match.match_number as number} vs ${match.opponent_team as string}`,
  })
}
