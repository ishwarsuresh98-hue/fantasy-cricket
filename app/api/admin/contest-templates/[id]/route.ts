import { NextResponse }    from 'next/server'
import { createClient }    from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── PATCH /api/admin/contest-templates/[id] ───────────────────────────────────
//
// Partially updates a contest template row. Requires admin role.
//
// Allowed fields: name, entry_fee, max_entries, platform_fee_pct,
//                 is_guaranteed, auto_create, is_active

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  // ── Auth + role ───────────────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const ALLOWED = new Set([
    'name', 'entry_fee', 'max_entries', 'platform_fee_pct',
    'is_guaranteed', 'auto_create', 'is_active',
  ])
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.has(k)) patch[k] = v
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No patchable fields provided' }, { status: 400 })
  }

  // ── Admin update ──────────────────────────────────────────────────────────
  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }

  const { data, error } = await admin
    .from('contest_templates')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, template: data })
}
