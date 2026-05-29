import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── GET /api/admin/match-by-pc-id?pc_id=<play_cricket_id> ────────────────────
//
// Looks up a match row by its Play Cricket numeric ID.
// Used by the Quick Import panel so the admin only needs to supply the PC ID
// and we resolve the internal match UUID automatically.
//
// Requires admin role.

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const pcId = searchParams.get('pc_id')?.trim()
  if (!pcId) return NextResponse.json({ error: 'pc_id query param is required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: match } = await admin
    .from('matches')
    .select('id, match_number, opponent, match_date, play_cricket_id')
    .eq('play_cricket_id', pcId)
    .maybeSingle()

  if (!match) {
    return NextResponse.json({
      data:  null,
      error: `No match found with Play Cricket ID ${pcId}. Run "Sync Matches from Play Cricket" first to import fixtures.`,
    })
  }

  return NextResponse.json({ data: match })
}
