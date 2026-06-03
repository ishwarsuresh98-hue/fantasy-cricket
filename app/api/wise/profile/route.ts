import { NextResponse }  from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProfiles }  from '@/lib/wise'

export const dynamic = 'force-dynamic'

/**
 * GET /api/wise/profile
 * Admin-only. Returns all Wise profiles for the configured API token,
 * plus the selected profile ID (business preferred, else personal).
 */
export async function GET() {
  // ── Auth — admin only ─────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!process.env.WISE_API_TOKEN) {
    return NextResponse.json({ error: 'WISE_API_TOKEN is not set.' }, { status: 503 })
  }

  try {
    const profiles   = await getProfiles()
    const business   = profiles.find((p) => p.type === 'business')
    const selected   = business ?? profiles[0]
    return NextResponse.json({
      profiles,
      selected_profile_id: selected?.id ?? null,
    })
  } catch (e: unknown) {
    console.error('[wise/profile]', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
