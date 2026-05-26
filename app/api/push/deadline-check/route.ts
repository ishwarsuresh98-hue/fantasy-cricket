import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { broadcastPush } from '@/lib/push'

/**
 * GET /api/push/deadline-check
 *
 * Finds upcoming matches whose match_date is 1.5–2.5 hours from now
 * and sends a "Transfers close soon" push to all subscribers.
 *
 * Intended to be called by a cron every 30 minutes.
 * Vercel vercel.json example:
 *   crons: [{ path: "/api/push/deadline-check", schedule: "0,30 * * * *" }]
 *
 * Gate with CRON_SECRET in .env.local for production:
 *   Authorization: Bearer CRON_SECRET_VALUE
 */
export async function GET(request: Request) {
  // Gate: optional shared secret for cron callers
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message, skipped: true }, { status: 503 })
  }

  const now = new Date()
  const lo  = new Date(now.getTime() +  90 * 60 * 1000).toISOString()  // +1.5 h
  const hi  = new Date(now.getTime() + 150 * 60 * 1000).toISOString()  // +2.5 h

  const { data: matches } = await admin
    .from('matches')
    .select('id, match_number, match_date')
    .eq('status', 'upcoming')
    .gte('match_date', lo)
    .lte('match_date', hi)

  if (!matches?.length) {
    return NextResponse.json({ ok: true, fired: 0 })
  }

  let sent = 0
  for (const match of matches) {
    const counts = await broadcastPush({
      payload: {
        title: `⏰ Transfers close soon!`,
        body:  `Deadline for Match ${match.match_number} is in 2 hours. Lock in your team now.`,
        icon:  '/icon-192.png',
        badge: '/icon-192.png',
        url:   '/transfers',
        tag:   `deadline-m${match.match_number}`,
      },
    })
    sent += counts.sent
  }

  return NextResponse.json({ ok: true, matches: matches.length, sent })
}
