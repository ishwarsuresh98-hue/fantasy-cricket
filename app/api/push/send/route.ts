import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOnePush, broadcastPush } from '@/lib/push'

// ── Payload types ─────────────────────────────────────────────────────────────
type NotifType = 'score_update' | 'new_match' | 'deadline'

interface SendBody {
  type:         NotifType
  matchId?:     string      // score_update
  opponent_team?: string    // new_match
  matchDate?:   string      // new_match
  matchNumber?: number      // new_match | deadline
  userId?:      string      // optional: target a single user
}

// ── POST /api/push/send ───────────────────────────────────────────────────────
export async function POST(request: Request) {
  // ── Auth: must be signed-in admin ─────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Service-role client ───────────────────────────────────────────────────
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message, skipped: true }, { status: 503 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: SendBody
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Handle each type ──────────────────────────────────────────────────────

  if (body.type === 'score_update' && body.matchId) {
    const { data: match } = await admin
      .from('matches').select('match_number, season_id').eq('id', body.matchId).single()
    if (!match) return NextResponse.json({ error: 'match not found' }, { status: 404 })

    // Points per fantasy team
    const { data: sels } = await admin
      .from('fantasy_selections')
      .select('fantasy_team_id, points_earned')
      .eq('match_id', body.matchId)

    const matchPts: Record<string, number> = {}
    for (const s of sels ?? []) {
      matchPts[s.fantasy_team_id] = (matchPts[s.fantasy_team_id] ?? 0) + s.points_earned
    }

    const { data: teams } = await admin
      .from('fantasy_teams')
      .select('id, user_id')
      .eq('season_id', match.season_id)

    const counts: Record<string, number> = { sent: 0, gone: 0, error: 0 }
    const gone: string[] = []

    for (const team of teams ?? []) {
      const pts = matchPts[team.id]
      if (pts == null) continue

      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', team.user_id)

      for (const sub of subs ?? []) {
        const result = await sendOnePush(sub, {
          title: `🏏 GW${match.match_number} points in!`,
          body:  `Your team scored ${pts % 1 === 0 ? pts : pts.toFixed(1)} pts in Matchday ${match.match_number}.`,
          icon:  '/icon-192.png',
          badge: '/icon-192.png',
          url:   '/dashboard',
          tag:   `score-m${match.match_number}`,
        })
        counts[result] = (counts[result] ?? 0) + 1
        if (result === 'gone') gone.push(sub.endpoint)
      }
    }

    if (gone.length) {
      await admin.from('push_subscriptions').delete().in('endpoint', gone)
    }

    return NextResponse.json({ ok: true, ...counts })
  }

  if (body.type === 'new_match' && body.opponent_team && body.matchDate) {
    const fmtDate = new Date(body.matchDate).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
    const counts = await broadcastPush({
      payload: {
        title: `📅 New match: vs ${body.opponent_team}`,
        body:  `Match ${body.matchNumber ?? ''} added — ${fmtDate}. Get your team ready!`,
        icon:  '/icon-192.png',
        badge: '/icon-192.png',
        url:   '/matches',
        tag:   `new-match-${body.matchNumber}`,
      },
    })
    return NextResponse.json({ ok: true, ...counts })
  }

  if (body.type === 'deadline' && body.matchNumber != null) {
    const counts = await broadcastPush({
      payload: {
        title: `⏰ Transfers close soon!`,
        body:  `Deadline for Match ${body.matchNumber} is in 2 hours. Lock in your team now.`,
        icon:  '/icon-192.png',
        badge: '/icon-192.png',
        url:   '/transfers',
        tag:   `deadline-m${body.matchNumber}`,
      },
    })
    return NextResponse.json({ ok: true, ...counts })
  }

  return NextResponse.json(
    { error: 'type must be score_update | new_match | deadline with required fields' },
    { status: 400 },
  )
}
