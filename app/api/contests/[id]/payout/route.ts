import { NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Payout structure helpers ──────────────────────────────────────────────────

interface PayoutSlot { rank: number; pct: number }

/** Default split based on field size.  Percentages always sum to 100. */
function defaultPayoutStructure(teamCount: number): PayoutSlot[] {
  if (teamCount <= 1)  return [{ rank: 1, pct: 100 }]
  if (teamCount <= 2)  return [{ rank: 1, pct: 70 }, { rank: 2, pct: 30 }]
  if (teamCount <= 5)  return [{ rank: 1, pct: 60 }, { rank: 2, pct: 25 }, { rank: 3, pct: 15 }]
  if (teamCount <= 10) return [
    { rank: 1, pct: 50 }, { rank: 2, pct: 25 },
    { rank: 3, pct: 15 }, { rank: 4, pct: 10 },
  ]
  return [
    { rank: 1, pct: 40 }, { rank: 2, pct: 25 }, { rank: 3, pct: 15 },
    { rank: 4, pct: 10 }, { rank: 5, pct: 10 },
  ]
}

// ── POST /api/contests/[id]/payout — admin only ───────────────────────────────
//
// Calculates final rankings, distributes prize_pool to winners' wallets,
// records rows in contest_payouts, and credits wallet_transactions.
//
// Idempotency: returns 409 if payouts already exist for this contest.
//
// Optional body:
//   { payout_structure: [{ rank: number, pct: number }, ...] }
//   If omitted, the default split (above) is used.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contestId } = await params
  const supabase = await createClient()

  // ── Auth: admin only ──────────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Service-role client for wallet ops ────────────────────────────────────
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }

  // ── Load contest ──────────────────────────────────────────────────────────
  const { data: contest } = await admin
    .from('contests')
    .select('id, name, prize_pool')
    .eq('id', contestId)
    .single()

  if (!contest) {
    return NextResponse.json({ error: 'Contest not found' }, { status: 404 })
  }

  // ── Idempotency guard ─────────────────────────────────────────────────────
  const { count: existingPayouts } = await admin
    .from('contest_payouts')
    .select('*', { count: 'exact', head: true })
    .eq('contest_id', contestId)

  if ((existingPayouts ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Payouts have already been distributed for this contest' },
      { status: 409 },
    )
  }

  // ── Parse optional custom payout structure ────────────────────────────────
  let customStructure: PayoutSlot[] | null = null
  try {
    const body = await request.json()
    if (Array.isArray(body?.payout_structure)) {
      customStructure = body.payout_structure as PayoutSlot[]
    }
  } catch { /* no body is fine */ }

  // ── Ranked entries ────────────────────────────────────────────────────────
  const { data: entries } = await admin
    .from('contest_entries')
    .select('fantasy_team_id')
    .eq('contest_id', contestId)

  if (!entries?.length) {
    return NextResponse.json({ ok: true, paid: 0, message: 'No entries — nothing to pay out' })
  }

  const teamIds = entries.map((e) => e.fantasy_team_id)

  const { data: teams, error: teamsErr } = await admin
    .from('fantasy_teams')
    .select('id, total_points, user_id')
    .in('id', teamIds)
    .order('total_points', { ascending: false })

  if (teamsErr || !teams?.length) {
    return NextResponse.json({ error: teamsErr?.message ?? 'No teams found' }, { status: 500 })
  }

  const structure = customStructure ?? defaultPayoutStructure(teams.length)
  const prizePool = Number(contest.prize_pool ?? 0)

  if (prizePool <= 0) {
    return NextResponse.json({ ok: true, paid: 0, message: 'No prize pool to distribute' })
  }

  // ── Distribute prizes ─────────────────────────────────────────────────────
  const paid: { rank: number; user_id: string; prize_amount: number }[] = []

  for (const slot of structure) {
    const teamIdx = slot.rank - 1
    if (teamIdx >= teams.length) continue

    const team        = teams[teamIdx]
    const prizeAmount = Math.round((prizePool * slot.pct / 100) * 100) / 100
    if (prizeAmount <= 0) continue

    // ── Record payout ──────────────────────────────────────────────────────
    const { error: payoutErr } = await admin.from('contest_payouts').insert({
      contest_id:      contestId,
      user_id:         team.user_id,
      fantasy_team_id: team.id,
      rank:            slot.rank,
      prize_amount:    prizeAmount,
      paid_at:         new Date().toISOString(),
    })

    if (payoutErr) {
      console.error(`[contests/payout] contest_payouts insert error (rank ${slot.rank}):`, payoutErr)
      continue
    }

    // ── Credit wallet ──────────────────────────────────────────────────────
    const { data: wallet } = await admin
      .from('wallets')
      .select('id, balance')
      .eq('user_id', team.user_id)
      .single()

    if (wallet) {
      const newBalance = Math.round((Number(wallet.balance) + prizeAmount) * 100) / 100
      await admin
        .from('wallets')
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq('id', wallet.id)

      await admin.from('wallet_transactions').insert({
        wallet_id:    wallet.id,
        type:         'credit',
        amount:       prizeAmount,
        description:  `Prize — ${contest.name} (Rank #${slot.rank})`,
        reference_id: contestId,
      })
    }

    paid.push({ rank: slot.rank, user_id: team.user_id, prize_amount: prizeAmount })
  }

  return NextResponse.json({ ok: true, paid: paid.length, payouts: paid })
}
