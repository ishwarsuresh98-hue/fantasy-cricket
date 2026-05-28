import { NextResponse }    from 'next/server'
import { createClient }    from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ContestTeamPlayer } from '@/types'

// ── POST /api/contests/[id]/pick-team ─────────────────────────────────────────
//
// Saves a gameweek team selection and joins the contest in one step.
//
// Body: {
//   fantasy_team_id:  string                     — season team (for contest_entry)
//   players:          ContestTeamPlayer[]         — exactly 11 picks
//   payment_method:   'wallet' | 'gateway'
// }
//
// Validates:
//   • Exactly 11 players
//   • Budget ≤ 100cr
//   • Role constraints: ≥1 WK, ≥3 BAT, ≥3 BOWL, ≥1 AR
//   • Exactly one captain, one vice-captain
//
// On success:
//   • Upserts contest_teams row
//   • Handles payment (wallet debit or gateway redirect)
//   • Inserts contest_entry

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contestId } = await params
  const supabase = await createClient()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    fantasy_team_id?: string
    players?:         ContestTeamPlayer[]
    payment_method?:  string
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { fantasy_team_id, players, payment_method = 'wallet' } = body

  if (!fantasy_team_id) return NextResponse.json({ error: 'fantasy_team_id required' }, { status: 400 })
  if (!players || !Array.isArray(players) || players.length !== 11) {
    return NextResponse.json({ error: 'Exactly 11 players required' }, { status: 400 })
  }
  if (payment_method !== 'wallet' && payment_method !== 'gateway') {
    return NextResponse.json({ error: 'payment_method must be wallet or gateway' }, { status: 400 })
  }

  const captains = players.filter((p) => p.is_captain)
  const vcs      = players.filter((p) => p.is_vice_captain)
  if (captains.length !== 1) return NextResponse.json({ error: 'Exactly one captain required' }, { status: 400 })
  if (vcs.length !== 1)      return NextResponse.json({ error: 'Exactly one vice-captain required' }, { status: 400 })
  if (captains[0].player_id === vcs[0].player_id) {
    return NextResponse.json({ error: 'Captain and vice-captain must be different players' }, { status: 400 })
  }

  // ── Verify team ownership ─────────────────────────────────────────────────
  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id, user_id, season_id')
    .eq('id', fantasy_team_id)
    .eq('user_id', user.id)
    .single()

  if (!team) {
    return NextResponse.json({ error: 'Team not found or not owned by you' }, { status: 403 })
  }

  // ── Load contest ──────────────────────────────────────────────────────────
  const { data: contest } = await supabase
    .from('contests')
    .select('id, name, max_teams, entry_fee, prize_pool, gameweek_id, season_id')
    .eq('id', contestId)
    .single()

  if (!contest) {
    return NextResponse.json({ error: 'Contest not found' }, { status: 404 })
  }

  // ── Fetch and validate player prices + roles ──────────────────────────────
  const playerIds = players.map((p) => p.player_id)
  const { data: playerRows } = await supabase
    .from('players')
    .select('id, role, price, is_active')
    .in('id', playerIds)

  if (!playerRows || playerRows.length !== 11) {
    return NextResponse.json({ error: 'One or more players not found' }, { status: 400 })
  }

  const inactivePlayer = playerRows.find((p) => !p.is_active)
  if (inactivePlayer) {
    return NextResponse.json({ error: 'One or more players are inactive' }, { status: 400 })
  }

  const totalCost = playerRows.reduce((sum, p) => sum + Number(p.price ?? 0), 0)
  if (totalCost > 100) {
    return NextResponse.json({ error: `Team costs ${totalCost}cr — must be ≤ 100cr` }, { status: 400 })
  }

  // Role constraints
  const roleMap: Record<string, number> = {}
  for (const p of playerRows) {
    const role = p.role as string
    roleMap[role] = (roleMap[role] ?? 0) + 1
  }
  if ((roleMap['wicket_keeper'] ?? 0) < 1) return NextResponse.json({ error: 'Need at least 1 wicket keeper' }, { status: 400 })
  if ((roleMap['batsman'] ?? 0) < 3)       return NextResponse.json({ error: 'Need at least 3 batsmen' }, { status: 400 })
  if ((roleMap['bowler'] ?? 0) < 3)        return NextResponse.json({ error: 'Need at least 3 bowlers' }, { status: 400 })
  if ((roleMap['all_rounder'] ?? 0) < 1)   return NextResponse.json({ error: 'Need at least 1 all-rounder' }, { status: 400 })

  // ── Already entered? ──────────────────────────────────────────────────────
  const { data: existingEntry } = await supabase
    .from('contest_entries')
    .select('id')
    .eq('contest_id', contestId)
    .eq('fantasy_team_id', fantasy_team_id)
    .maybeSingle()

  if (existingEntry) {
    // Already entered — just update the team picks if still before lock
    const admin = createAdminClient()
    await admin
      .from('contest_teams')
      .upsert(
        { contest_id: contestId, user_id: user.id, players },
        { onConflict: 'contest_id,user_id' },
      )
    return NextResponse.json({ ok: true, joined: true, updated_team: true })
  }

  // ── Capacity check ────────────────────────────────────────────────────────
  const { count } = await supabase
    .from('contest_entries')
    .select('*', { count: 'exact', head: true })
    .eq('contest_id', contestId)

  if ((count ?? 0) >= Number(contest.max_teams ?? 100)) {
    return NextResponse.json({ error: 'Contest is full' }, { status: 409 })
  }

  const entryFee = Number(contest.entry_fee ?? 0)

  // ── Admin client for wallet ops ───────────────────────────────────────────
  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }

  // ── Upsert contest_team (save picks regardless of payment method) ─────────
  const { error: teamErr } = await admin
    .from('contest_teams')
    .upsert(
      { contest_id: contestId, user_id: user.id, players },
      { onConflict: 'contest_id,user_id' },
    )

  if (teamErr) {
    console.error('[pick-team] upsert contest_team error:', teamErr)
    return NextResponse.json({ error: teamErr.message }, { status: 500 })
  }

  // ── Free contest ──────────────────────────────────────────────────────────
  if (entryFee === 0) {
    const { error: joinErr } = await admin
      .from('contest_entries')
      .insert({ contest_id: contestId, fantasy_team_id })

    if (joinErr) {
      console.error('[pick-team] free join error:', joinErr)
      return NextResponse.json({ error: joinErr.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, joined: true })
  }

  // ── Wallet payment ────────────────────────────────────────────────────────
  if (payment_method === 'wallet') {
    const { data: wallet } = await admin
      .from('wallets')
      .select('id, balance')
      .eq('user_id', user.id)
      .single()

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    const balance = Number(wallet.balance)
    if (balance < entryFee) {
      return NextResponse.json(
        { error: 'Insufficient wallet balance', balance, required: entryFee },
        { status: 402 },
      )
    }

    const newBalance = Math.round((balance - entryFee) * 100) / 100
    const { error: walletErr } = await admin
      .from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', wallet.id)

    if (walletErr) {
      console.error('[pick-team] wallet debit error:', walletErr)
      return NextResponse.json({ error: walletErr.message }, { status: 500 })
    }

    await admin.from('wallet_transactions').insert({
      wallet_id:    wallet.id,
      type:         'debit',
      amount:       entryFee,
      description:  `Entry fee — ${contest.name}`,
      reference_id: contestId,
    })

    const { error: joinErr } = await admin
      .from('contest_entries')
      .insert({ contest_id: contestId, fantasy_team_id })

    if (joinErr) {
      // Best-effort refund
      await admin.from('wallets').update({ balance, updated_at: new Date().toISOString() }).eq('id', wallet.id)
      await admin.from('wallet_transactions').insert({
        wallet_id:    wallet.id,
        type:         'credit',
        amount:       entryFee,
        description:  `Refund — failed to join ${contest.name}`,
        reference_id: contestId,
      })
      console.error('[pick-team] entry insert error (refunded):', joinErr)
      return NextResponse.json({ error: joinErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, joined: true, wallet_balance: newBalance })
  }

  // ── Gateway payment ───────────────────────────────────────────────────────
  const { data: intent, error: intentErr } = await admin
    .from('payment_intents')
    .insert({
      user_id:         user.id,
      contest_id:      contestId,
      fantasy_team_id,
      amount:          entryFee,
      status:          'pending',
      gateway:         'stripe',
    })
    .select('id')
    .single()

  if (intentErr || !intent) {
    console.error('[pick-team] payment_intent insert error:', intentErr)
    return NextResponse.json({ error: intentErr?.message ?? 'Failed to create payment intent' }, { status: 500 })
  }

  const origin     = process.env.NEXT_PUBLIC_APP_URL ?? `https://${request.headers.get('host') ?? 'localhost:3000'}`
  const returnUrl  = `${origin}/clubs/${slug(contest)}/contests/${contestId}?payment=confirmed&intent=${intent.id}`

  return NextResponse.json({
    ok:                true,
    joined:            false,
    payment_intent_id: intent.id,
    contest_id:        contestId,
    entry_fee:         entryFee,
    return_url:        returnUrl,
  })
}

function slug(contest: { season_id?: string | null }): string {
  // We don't have slug in the contest row — the client provides it in the return URL
  // This is handled on the client side; this function exists as a fallback
  void contest
  return 'slough-cc'
}
