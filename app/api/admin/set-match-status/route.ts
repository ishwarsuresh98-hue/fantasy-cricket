export const dynamic = 'force-dynamic'

import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { MatchStatus }  from '@/types'

// ── POST /api/admin/set-match-status ─────────────────────────────────────────
//
// Updates a match's status field.
//
// Body: { matchId: string, status: 'upcoming' | 'live' | 'completed' }
// Requires admin role.

const VALID: MatchStatus[] = ['upcoming', 'live', 'completed']

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as { matchId?: string; status?: string }
  const { matchId, status } = body

  if (!matchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 })
  if (!status || !VALID.includes(status as MatchStatus))
    return NextResponse.json({ error: `status must be one of: ${VALID.join(', ')}` }, { status: 400 })

  const admin = createAdminClient()

  const { error } = await admin
    .from('matches')
    .update({ status })
    .eq('id', matchId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, matchId, status })
}
