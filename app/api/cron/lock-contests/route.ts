// ── GET /api/cron/lock-contests ───────────────────────────────────────────────
//
// Locks all open contests for any active gameweek whose deadline has passed.
// For open_league contests, also calls freeze_open_league_contest() to
// calculate and store the final prize pool.
//
// Runs every 5 minutes via Vercel cron (vercel.json).
// Safe to call repeatedly — already-locked contests are skipped.
//
// Vercel cron passes: Authorization: Bearer <CRON_SECRET>

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET ?? ''
  if (cronSecret) {
    const auth = request.headers.get('authorization') ?? ''
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

  const now = new Date().toISOString()

  // ── Find active gameweeks whose deadline has passed ───────────────────────
  const { data: gameweeks, error: gwErr } = await admin
    .from('gameweeks')
    .select('id, name, deadline')
    .eq('is_active', true)
    .eq('is_finished', false)
    .lte('deadline', now)

  if (gwErr) {
    console.error('[contests] lock-contests: gameweek query error:', gwErr.message)
    return NextResponse.json({ error: gwErr.message }, { status: 500 })
  }

  if (!gameweeks?.length) {
    return NextResponse.json({ ok: true, locked: 0, message: 'No gameweeks past deadline' })
  }

  let totalLocked = 0

  for (const gw of gameweeks) {
    // ── Fetch open contests for this gameweek ─────────────────────────────
    const { data: openContests, error: contestErr } = await admin
      .from('contests')
      .select('id, type')
      .eq('gameweek_id', gw.id)
      .eq('status', 'open')

    if (contestErr) {
      console.error(`[contests] lock-contests: contest query error for GW ${gw.id}:`, contestErr.message)
      continue
    }

    if (!openContests?.length) continue

    const regularIds    = openContests.filter((c) => c.type !== 'open_league').map((c) => c.id)
    const openLeagueIds = openContests.filter((c) => c.type === 'open_league').map((c) => c.id)

    // ── Lock regular contests in bulk ─────────────────────────────────────
    if (regularIds.length > 0) {
      const { error: lockErr } = await admin
        .from('contests')
        .update({ status: 'locked' })
        .in('id', regularIds)

      if (lockErr) {
        console.error(`[contests] lock-contests: bulk lock error for GW ${gw.id}:`, lockErr.message)
      } else {
        totalLocked += regularIds.length
      }
    }

    // ── Freeze open_league contests individually (calculates final pot) ───
    for (const id of openLeagueIds) {
      const { error: freezeErr } = await admin.rpc('freeze_open_league_contest', {
        p_contest_id: id,
      })

      if (freezeErr) {
        console.error(`[contests] lock-contests: freeze error for contest ${id}:`, freezeErr.message)
      } else {
        totalLocked += 1
      }
    }

    const lockedCount = regularIds.length + openLeagueIds.length
    console.log(
      `[contests] Auto-locked ${lockedCount} contest${lockedCount !== 1 ? 's' : ''} for gameweek ${gw.id} (${gw.name}) at deadline`
    )
  }

  return NextResponse.json({
    ok:     true,
    locked: totalLocked,
    gameweeks: gameweeks.length,
  })
}
