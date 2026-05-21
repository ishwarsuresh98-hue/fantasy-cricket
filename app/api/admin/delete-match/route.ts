import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(request: Request) {
  const supabase = await createClient()

  // ── Auth: admin only ───────────────────────────────────────────────────────
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

  // ── Payload ────────────────────────────────────────────────────────────────
  let matchId: string | undefined
  try {
    const body = await request.json()
    matchId = body.matchId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!matchId) {
    return NextResponse.json({ error: 'matchId is required' }, { status: 400 })
  }

  // ── Delete performances first, then the match ──────────────────────────────
  // Explicit delete in case FK cascade isn't set up on every related table.
  const { error: perfErr } = await supabase
    .from('match_performances')
    .delete()
    .eq('match_id', matchId)

  if (perfErr) {
    console.error('[delete-match] performances delete error:', perfErr)
    return NextResponse.json({ error: perfErr.message }, { status: 500 })
  }

  const { error: matchErr } = await supabase
    .from('matches')
    .delete()
    .eq('id', matchId)

  if (matchErr) {
    console.error('[delete-match] match delete error:', matchErr)
    return NextResponse.json({ error: matchErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
