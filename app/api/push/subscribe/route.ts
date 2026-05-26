import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/push/subscribe
 *
 * Body: { endpoint, keys: { p256dh, auth } }
 *
 * Saves (or refreshes) the calling user's Web Push subscription.
 * The unique constraint on (user_id, endpoint) means re-subscribing is safe.
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { endpoint, keys } = body
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: 'endpoint, keys.p256dh and keys.auth are required' },
      { status: 400 },
    )
  }

  // ── Upsert subscription ───────────────────────────────────────────────────
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'user_id,endpoint' },
    )

  if (error) {
    console.error('[push/subscribe] upsert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/push/subscribe
 *
 * Body: { endpoint }
 *
 * Removes the subscription (called when user disables notifications).
 */
export async function DELETE(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { endpoint?: string }
  try { body = await request.json() } catch { body = {} }

  if (!body.endpoint) {
    return NextResponse.json({ error: 'endpoint required' }, { status: 400 })
  }

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', body.endpoint)

  return NextResponse.json({ ok: true })
}
