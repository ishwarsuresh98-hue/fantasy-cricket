import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
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
  let body: { name?: string; matchId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name    = body.name?.trim()
  const matchId = body.matchId?.trim()

  if (!name || name.length < 2) {
    return NextResponse.json({ error: 'Player name is required (min 2 chars).' }, { status: 400 })
  }
  if (!matchId) {
    return NextResponse.json({ error: 'matchId is required.' }, { status: 400 })
  }

  // ── Resolve season from match ──────────────────────────────────────────────
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('season_id')
    .eq('id', matchId)
    .single()

  if (matchErr || !match) {
    return NextResponse.json({ error: 'Match not found.' }, { status: 404 })
  }

  // ── Insert player ──────────────────────────────────────────────────────────
  // Defaults: All-Rounder role, 7 credits, active.
  const { data: player, error: insertErr } = await supabase
    .from('players')
    .insert({
      season_id:  match.season_id,
      name,
      role:       'all_rounder',
      price:      7,
      is_active:  true,
      profile_id: null,
    })
    .select()
    .single()

  if (insertErr) {
    console.error('[create-player]', insertErr)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json(player)
}
