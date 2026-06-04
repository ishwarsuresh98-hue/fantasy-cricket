import { NextResponse }       from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/onboarding  — marks the current user's onboarding as complete
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ onboarding_complete: true })
    .eq('id', user.id)

  if (error) {
    console.error('[onboarding] update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
