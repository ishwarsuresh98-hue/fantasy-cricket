/**
 * POST /api/xi/matches/performance
 *
 * Called by ClubPulse at end of match to sync a player's performance and
 * receive calculated fantasy + rewards points back.
 * Authentication: Bearer token (XI_API_KEY) — server-to-server only.
 *
 * Request body:
 *   {
 *     xi_user_id:    string
 *     match_id:      string   (ClubPulse match UUID)
 *     player_role:   'batsman' | 'bowler' | 'all_rounder' | 'wicket_keeper'
 *     is_captain:    boolean
 *     is_vice_captain: boolean
 *     // batting
 *     runs_scored:   number
 *     balls_faced:   number
 *     fours:         number
 *     sixes:         number
 *     did_not_bat:   boolean
 *     // bowling
 *     wickets:       number
 *     maidens:       number
 *     dot_balls:     number
 *     // fielding
 *     catches:       number
 *     stumpings:     number
 *     run_outs:      number
 *   }
 *
 * Response:
 *   200  {
 *          fantasy_points:    number,
 *          rewards_points:    number,
 *          new_wallet_balance: number,
 *          tier_multiplier:   number,
 *          breakdown: { batting: number, bowling: number, fielding: number, bonuses: number }
 *        }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'
import { verifyXiApiKey }            from '@/lib/xi/auth'
import { computeBasePoints, applyMultiplier } from '@/lib/scoring'
import type { MatchPerformance }     from '@/types'

// Rewards points = fantasy_points × tier_multiplier × REWARDS_SCALE
// Keeps rewards roughly one-tenth of fantasy points, so wallets don't inflate.
const REWARDS_SCALE = 0.1

/** Map wallet tier → rewards multiplier */
function tierMultiplier(tier: string): number {
  switch (tier) {
    case 'gold':     return 2.0
    case 'silver':   return 1.5
    case 'bronze':
    default:         return 1.0
  }
}

/** Re-derive a simple batting / bowling / fielding breakdown from raw stats. */
function pointsBreakdown(perf: Partial<MatchPerformance>, basePoints: number) {
  // Batting sub-total (re-compute inline — scoring lib exposes one total)
  let batting = 0
  if (!perf.did_not_bat) {
    const runs   = perf.runs_scored  ?? 0
    const balls  = perf.balls_faced  ?? 0
    const fours  = perf.fours        ?? 0
    const sixes  = perf.sixes        ?? 0
    batting += runs + fours + sixes * 2
    if (runs >= 100)       batting += 16
    else if (runs >= 50)   batting += 8
    if (runs === 0 && balls > 0) batting -= 2
    const role = perf.player_role ?? null
    if (role !== 'bowler' && balls >= 10) {
      const sr = (runs / balls) * 100
      if (sr >= 150)       batting += 3
      else if (sr >= 125)  batting += 2
      else if (sr >= 100)  batting += 1
      else if (sr < 75)    batting -= 2
    }
  }

  let bowling = 0
  const wkts    = perf.wickets  ?? 0
  const maidens = perf.maidens  ?? 0
  bowling += wkts * 25
  if (wkts >= 5)       bowling += 16
  else if (wkts >= 4)  bowling += 8
  else if (wkts >= 3)  bowling += 4
  bowling += maidens * 8

  let fielding = 0
  fielding += (perf.catches   ?? 0) * 8
  fielding += (perf.stumpings ?? 0) * 12
  fielding += (perf.run_outs  ?? 0) * 6

  const bonuses = basePoints - batting - bowling - fielding

  return { batting, bowling, fielding, bonuses }
}

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const authError = verifyXiApiKey(req)
  if (authError) return authError

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const xi_user_id      = body.xi_user_id      as string | undefined
  const match_id        = body.match_id         as string | undefined
  const is_captain      = Boolean(body.is_captain)
  const is_vice_captain = Boolean(body.is_vice_captain)

  if (!xi_user_id || !match_id) {
    return NextResponse.json(
      { error: 'Missing required fields: xi_user_id, match_id' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // ── Look up XI user + tier ────────────────────────────────────────────────
  const { data: xiUser, error: userErr } = await admin
    .from('xi_users')
    .select('id, wallet_balance, tier')
    .eq('id', xi_user_id)
    .maybeSingle()

  if (userErr || !xiUser) {
    return NextResponse.json({ error: 'XI user not found' }, { status: 404 })
  }

  // ── Build performance object for scoring lib ──────────────────────────────
  const perf: Partial<MatchPerformance> = {
    player_role:  body.player_role  as MatchPerformance['player_role'] | undefined,
    runs_scored:  Number(body.runs_scored  ?? 0),
    balls_faced:  Number(body.balls_faced  ?? 0),
    fours:        Number(body.fours        ?? 0),
    sixes:        Number(body.sixes        ?? 0),
    did_not_bat:  Boolean(body.did_not_bat),
    wickets:      Number(body.wickets      ?? 0),
    maidens:      Number(body.maidens      ?? 0),
    dot_balls:    Number(body.dot_balls    ?? 0),
    catches:      Number(body.catches      ?? 0),
    stumpings:    Number(body.stumpings    ?? 0),
    run_outs:     Number(body.run_outs     ?? 0),
  }

  // ── Calculate points ──────────────────────────────────────────────────────
  const basePoints    = computeBasePoints(perf)
  const fantasyPoints = applyMultiplier(basePoints, is_captain, is_vice_captain)
  const multiplier    = tierMultiplier(xiUser.tier ?? 'bronze')
  const rewardsPoints = Math.round(fantasyPoints * multiplier * REWARDS_SCALE)
  const newBalance    = (xiUser.wallet_balance ?? 0) + rewardsPoints

  // ── Persist performance record ────────────────────────────────────────────
  const { error: perfErr } = await admin
    .from('xi_match_performances')
    .upsert(
      {
        xi_user_id,
        match_id,
        ...perf,
        base_points:     basePoints,
        fantasy_points:  fantasyPoints,
        rewards_earned:  rewardsPoints,
      },
      { onConflict: 'xi_user_id,match_id' },
    )

  if (perfErr) {
    console.error('[xi/matches/performance] upsert error:', perfErr)
    // Non-fatal: still return points so ClubPulse can store them
  }

  // ── Update wallet balance ─────────────────────────────────────────────────
  const { error: walletErr } = await admin
    .from('xi_users')
    .update({ wallet_balance: newBalance })
    .eq('id', xi_user_id)

  if (walletErr) {
    console.error('[xi/matches/performance] wallet update error:', walletErr)
  }

  // ── Insert wallet transaction log ─────────────────────────────────────────
  await admin.from('xi_wallet_transactions').insert({
    xi_user_id,
    amount:      rewardsPoints,
    category:    'match_performance',
    reference:   match_id,
    balance_after: newBalance,
  })

  return NextResponse.json({
    fantasy_points:     fantasyPoints,
    rewards_points:     rewardsPoints,
    new_wallet_balance: newBalance,
    tier_multiplier:    multiplier,
    breakdown:          pointsBreakdown(perf, basePoints),
  })
}
