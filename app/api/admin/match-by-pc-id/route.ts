import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const pc_id = new URL(req.url).searchParams.get('pc_id')
  if (!pc_id) return NextResponse.json({ error: 'pc_id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('matches')
    .select('id, opponent, match_date')
    .eq('play_cricket_id', pc_id)
    .single()

  if (!data) return NextResponse.json({ data: null, error: 'No match found with that Play Cricket ID' })
  return NextResponse.json({ data })
}
