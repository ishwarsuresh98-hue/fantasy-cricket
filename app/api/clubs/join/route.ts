import { NextResponse }       from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/clubs/join
 * Body: { club_id: string }
 *
 * Rules:
 *   - First club is always free — creates club_membership and sets profiles.club_id
 *   - Second+ clubs require an active row in the memberships table (£5/year)
 *   - Returns { ok, membership_required } so the client knows to redirect to paywall
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { club_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { club_id } = body
  if (!club_id) return NextResponse.json({ error: 'club_id is required' }, { status: 400 })

  const admin = createAdminClient()

  // ── Check if already a member ─────────────────────────────────────────────
  const { data: existing } = await admin
    .from('club_memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('club_id', club_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: true, already_member: true })
  }

  // ── Count existing club memberships ───────────────────────────────────────
  const { count } = await admin
    .from('club_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const isFirstClub = (count ?? 0) === 0

  // ── If not first club, check for active membership ────────────────────────
  if (!isFirstClub) {
    const { data: membership } = await admin
      .from('memberships')
      .select('status, expires_at')
      .eq('user_id', user.id)
      .maybeSingle()

    const isActive = membership?.status === 'active' &&
      (!membership.expires_at || new Date(membership.expires_at) > new Date())

    if (!isActive) {
      return NextResponse.json({
        ok: false,
        membership_required: true,
        message: 'A £5/year membership is required to join multiple clubs.',
      }, { status: 402 })
    }
  }

  // ── Insert club membership ────────────────────────────────────────────────
  const { error: insertErr } = await admin
    .from('club_memberships')
    .insert({ user_id: user.id, club_id })

  if (insertErr && insertErr.code !== '23505') { // 23505 = already exists (race)
    console.error('[clubs/join] insert error:', insertErr)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // ── Set primary club if this is the first ────────────────────────────────
  if (isFirstClub) {
    await admin
      .from('profiles')
      .update({ club_id })
      .eq('id', user.id)
  }

  return NextResponse.json({ ok: true })
}
