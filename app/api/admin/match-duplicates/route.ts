export const dynamic = 'force-dynamic'

import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/admin/match-duplicates
// Returns matches that share a play_cricket_id (i.e. duplicate rows).
// Also returns the IDs of the older duplicate rows for easy bulk-deletion.
// Requires admin role.

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // Fetch all matches that have a play_cricket_id
  const { data: rows, error } = await admin
    .from('matches')
    .select('id, match_number, opponent_team, our_team, match_date, play_cricket_id, created_at')
    .not('play_cricket_id', 'is', null)
    .order('play_cricket_id')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by play_cricket_id
  const groups: Record<string, typeof rows> = {}
  for (const row of rows ?? []) {
    const key = row.play_cricket_id as string
    if (!groups[key]) groups[key] = []
    groups[key].push(row)
  }

  // Keep only groups with more than one row
  const duplicates = Object.entries(groups)
    .filter(([, arr]) => arr.length > 1)
    .map(([pc_id, arr]) => ({
      play_cricket_id: pc_id,
      count:           arr.length,
      // The first row (oldest) is the keeper; the rest are duplicates to delete
      keep:            arr[0],
      delete_ids:      arr.slice(1).map(r => r.id),
      all_rows:        arr,
    }))

  return NextResponse.json({
    total_matches:   rows?.length ?? 0,
    duplicate_groups: duplicates.length,
    total_duplicates: duplicates.reduce((s, d) => s + d.delete_ids.length, 0),
    duplicates,
  })
}
