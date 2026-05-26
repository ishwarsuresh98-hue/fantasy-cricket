/**
 * Shared push-notification utilities used by multiple API routes.
 * Keeps web-push config in one place and avoids circular HTTP calls.
 */
import webpush, { type PushSubscription } from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

// ── VAPID initialisation ──────────────────────────────────────────────────────
// Called lazily so the module can be imported without crashing at build time
// if env vars aren't populated yet.
let vapidReady = false
function ensureVapid() {
  if (vapidReady) return
  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const sub  = process.env.VAPID_SUBJECT ?? 'mailto:ishwarsuresh98@outlook.com'
  if (!pub || !priv) {
    throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY env var missing')
  }
  webpush.setVapidDetails(sub, pub, priv)
  vapidReady = true
}

// ── Low-level send ────────────────────────────────────────────────────────────

export type SendResult = 'ok' | 'gone' | 'error'

export async function sendOnePush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: object,
): Promise<SendResult> {
  ensureVapid()
  const wpSub: PushSubscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  }
  try {
    await webpush.sendNotification(wpSub, JSON.stringify(payload))
    return 'ok'
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 410 || status === 404) return 'gone'
    console.error('[push] sendNotification error:', err)
    return 'error'
  }
}

// ── Broadcast to all subscribers (or a specific user) ─────────────────────────

export interface BroadcastOptions {
  payload:  object
  userId?:  string   // if set, only send to this user's subscriptions
}

export async function broadcastPush(opts: BroadcastOptions): Promise<{ sent: number; gone: number; error: number }> {
  const admin = createAdminClient()

  let query = admin.from('push_subscriptions').select('endpoint, p256dh, auth, user_id')
  if (opts.userId) query = query.eq('user_id', opts.userId) as typeof query

  const { data: subs } = await query

  const counts: Record<string, number> = { sent: 0, gone: 0, error: 0 }
  const gone: string[] = []

  for (const sub of subs ?? []) {
    const result = await sendOnePush(sub, opts.payload)
    counts[result] = (counts[result] ?? 0) + 1
    if (result === 'gone') gone.push(sub.endpoint)
  }

  // Purge expired subscriptions
  if (gone.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', gone)
  }

  return { sent: counts.sent ?? 0, gone: counts.gone ?? 0, error: counts.error ?? 0 }
}
