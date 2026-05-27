import { NextResponse }    from 'next/server'
import { createClient }    from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── POST /api/admin/generate-contests/[matchId] ───────────────────────────────
//
// Calls the Supabase RPC `auto_create_contests_for_match(match_id)` which reads
// the club's active contest templates and inserts contest rows for that match.
//
// Requires admin role.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params
  const supabase = await createClient()

  // ── Auth + role check ─────────────────────────────────────────────────────
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

  // ── Verify match exists ───────────────────────────────────────────────────
  const { data: match } = await supabase
    .from('matches')
    .select('id, match_number, opponent')
    .eq('id', matchId)
    .single()

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  // ── Run RPC via admin client ──────────────────────────────────────────────
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }

  const { data: created, error: rpcErr } = await admin.rpc(
    'auto_create_contests_for_match',
    { p_match_id: matchId },
  )

  if (rpcErr) {
    console.error('[generate-contests] RPC error:', rpcErr)
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  const count = Array.isArray(created) ? created.length : (created as number | null ?? 0)
  return NextResponse.json({
    ok:      true,
    created: count,
    match:   `GW${match.match_number} vs ${match.opponent}`,
  })
}
