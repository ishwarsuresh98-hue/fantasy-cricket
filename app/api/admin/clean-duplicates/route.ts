export const dynamic = 'force-dynamic'

import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/admin/clean-duplicates
// For every play_cricket_id that appears on more than one match row,
// keeps the NEWEST row (latest created_at) and deletes the older ones.
// Requires admin role. Delete this file after the one-time cleanup.

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // Load all matches with a play_cricket_id, newest first
  const { data: rows, error: fetchErr } = await admin
    .from('matches')
    .select('id, play_cricket_id, created_at, opponent_team')
    .not('play_cricket_id', 'is', null)
    .order('created_at', { ascending: false })   // newest first

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  // Group by play_cricket_id — first entry is newest (the keeper)
  const seen   = new Map<string, string>()   // pc_id → keeper row id
  const toDelete: string[] = []

  for (const row of rows ?? []) {
    const key = row.play_cricket_id as string
    if (seen.has(key)) {
      toDelete.push(row.id as string)          // older duplicate — queue for deletion
    } else {
      seen.set(key, row.id as string)          // newest — keep this one
    }
  }

  if (toDelete.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, message: 'No duplicates found.' })
  }

  // Delete in batches of 50 to stay within PostgREST limits
  const BATCH = 50
  let deleted = 0
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH)
    const { error: delErr } = await admin
      .from('matches')
      .delete()
      .in('id', batch)
    if (delErr) return NextResponse.json({ error: delErr.message, deleted }, { status: 500 })
    deleted += batch.length
  }

  // Return final match count
  const { count } = await admin
    .from('matches')
    .select('id', { count: 'exact', head: true })

  return NextResponse.json({ ok: true, deleted, remaining_matches: count })
}
