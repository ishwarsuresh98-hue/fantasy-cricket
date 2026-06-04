import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED = ['open', 'locked', 'cancelled', 'completed'] as const
type Status   = typeof ALLOWED[number]

// ── PATCH /api/admin/contests/[id]/status ─────────────────────────────────────
// Update the status of a contest. Admin only.

export async function PATCH(
  req:      Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body   = await req.json() as { status?: string }
  const status = body.status as Status | undefined

  if (!status || !(ALLOWED as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${ALLOWED.join(', ')}` }, { status: 400 })
  }

  const admin = createAdminClient()

  // Open leagues use the freeze function on lock — it calculates final_prize_pool
  if (status === 'locked') {
    const { data: contest } = await admin.from('contests').select('type').eq('id', id).single()
    if (contest?.type === 'open_league') {
      const { error: fnErr } = await admin.rpc('freeze_open_league_contest', { p_contest_id: id })
      if (fnErr) return NextResponse.json({ error: fnErr.message }, { status: 500 })
      return NextResponse.json({ ok: true, status: 'locked', frozen: true })
    }
  }

  const { error } = await admin
    .from('contests')
    .update({ status })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status })
}
