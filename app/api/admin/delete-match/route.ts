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

  // ── Read the match before deleting so we know its number and season ────────
  const { data: match, error: fetchErr } = await supabase
    .from('matches')
    .select('match_number, season_id')
    .eq('id', matchId)
    .single()

  if (fetchErr || !match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  const { match_number: deletedNumber, season_id: seasonId } = match

  // ── Delete performances first, then the match ──────────────────────────────
  // Explicit delete guards against tables without ON DELETE CASCADE.
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

  // ── Renumber subsequent matches ────────────────────────────────────────────
  // There is a unique(season_id, match_number) constraint, so we can't do a
  // single bulk decrement — Postgres checks per-row and would see a transient
  // duplicate.  Instead we update in ascending order: each step fills the gap
  // left by the previous one, so no two rows ever share a number mid-flight.
  //
  //   Before delete:  3, [4], 5, 6   (deleting 4)
  //   Update 5 → 4:   3,  4, 5, 6   → 3, 4*, 5, 6   (4* is old 5; old 4 gone)
  //   Update 6 → 5:   3,  4, 5*, 6  → 3, 4,  5*, ...
  //
  const { data: laterMatches, error: listErr } = await supabase
    .from('matches')
    .select('id, match_number')
    .eq('season_id', seasonId)
    .gt('match_number', deletedNumber)
    .order('match_number', { ascending: true })

  if (listErr) {
    console.error('[delete-match] list later matches error:', listErr)
    // Deletion succeeded; renumbering failed — return a partial-success warning.
    return NextResponse.json({ ok: true, warning: 'Match deleted but renumbering failed: ' + listErr.message })
  }

  for (const m of laterMatches ?? []) {
    const { error: renumErr } = await supabase
      .from('matches')
      .update({ match_number: m.match_number - 1 })
      .eq('id', m.id)

    if (renumErr) {
      console.error('[delete-match] renumber error for match', m.id, renumErr)
      return NextResponse.json({
        ok: true,
        warning: `Match deleted but could not renumber match ${m.match_number}: ${renumErr.message}`,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
