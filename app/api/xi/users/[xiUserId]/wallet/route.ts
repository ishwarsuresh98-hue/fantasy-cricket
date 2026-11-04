/**
 * GET /api/xi/users/[xiUserId]/wallet
 *
 * Returns a player's current wallet state.
 * Called by ClubPulse to display reward points on the player dashboard.
 * Authentication: Bearer token (XI_API_KEY) — server-to-server only.
 *
 * Response:
 *   200  { balance: number, tier: string, tier_multiplier: number, lifetime_earned: number }
 *   404  { error: "User not found" }
 *   401  { error: "Unauthorized" }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'
import { verifyXiApiKey }            from '@/lib/xi/auth'

/** Map wallet tier → rewards multiplier (mirrors performance endpoint) */
function tierMultiplier(tier: string): number {
  switch (tier) {
    case 'gold':   return 2.0
    case 'silver': return 1.5
    case 'bronze':
    default:       return 1.0
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ xiUserId: string }> },
) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const authError = verifyXiApiKey(req)
  if (authError) return authError

  const { xiUserId } = await params

  if (!xiUserId) {
    return NextResponse.json({ error: 'Missing xiUserId' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: user, error } = await admin
    .from('xi_users')
    .select('wallet_balance, tier, lifetime_earned')
    .eq('id', xiUserId)
    .maybeSingle()

  if (error || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    balance:          user.wallet_balance    ?? 0,
    tier:             user.tier              ?? 'bronze',
    tier_multiplier:  tierMultiplier(user.tier ?? 'bronze'),
    lifetime_earned:  user.lifetime_earned   ?? 0,
  })
}
