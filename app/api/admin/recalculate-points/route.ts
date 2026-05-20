import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()

  // ── Auth: must be signed-in admin ─────────────────────────────────────────
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

  // ── Trigger scoring recalculation for all match_performances rows ─────────
  const { data, error } = await supabase.rpc('recalculate_all_points')

  if (error) {
    console.error('[recalculate-points] RPC error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rowsUpdated = data as number
  console.log(`[recalculate-points] Updated ${rowsUpdated} match_performances rows`)

  return NextResponse.json({ rowsUpdated })
}
