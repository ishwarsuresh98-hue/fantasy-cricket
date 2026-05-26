import { NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Thin Flatpay adapter ──────────────────────────────────────────────────────
// Swap this function when the real Flatpay SDK / API details are confirmed.
// Env vars needed:
//   FLATPAY_PUBLIC_KEY       — publishable key for the checkout URL
//   FLATPAY_CHECKOUT_URL     — base URL of the hosted checkout (default below)
//   NEXT_PUBLIC_APP_URL      — your app's canonical origin for return/webhook URLs

function buildFlatpayRedirectUrl(opts: {
  intentId:    string
  amountPence: number        // amount in pence (GBP × 100)
  description: string
  returnUrl:   string
  webhookUrl:  string
}): string {
  const base = process.env.FLATPAY_CHECKOUT_URL ?? 'https://checkout.flatpay.co.uk'
  const params = new URLSearchParams({
    order_id:    opts.intentId,
    amount:      String(opts.amountPence),
    currency:    'GBP',
    description: opts.description,
    success_url: opts.returnUrl,
    notify_url:  opts.webhookUrl,
    api_key:     process.env.FLATPAY_PUBLIC_KEY ?? '',
  })
  return `${base}?${params.toString()}`
}

// ── POST /api/contests/[id]/join ──────────────────────────────────────────────
//
// Body: {
//   fantasy_team_id: string
//   payment_method:  'wallet' | 'gateway'   (default: 'wallet')
// }
//
// Responses:
//   200  { ok: true, joined: true }                          — free or wallet join
//   200  { ok: true, joined: true, wallet_balance: number }  — wallet join, balance echoed
//   200  { ok: true, joined: false, redirect_url: string, payment_intent_id: string }
//                                                            — gateway: redirect to checkout
//   402  { error: 'Insufficient wallet balance', balance, required }
//   409  { error: 'Already joined' | 'Contest is full' }

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
  let body: { fantasy_team_id?: string; payment_method?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { fantasy_team_id, payment_method = 'wallet' } = body
  if (!fantasy_team_id) {
    return NextResponse.json({ error: 'fantasy_team_id is required' }, { status: 400 })
  }
  if (payment_method !== 'wallet' && payment_method !== 'gateway') {
    return NextResponse.json({ error: 'payment_method must be wallet or gateway' }, { status: 400 })
  }

  // ── Verify team ownership ─────────────────────────────────────────────────
  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id, user_id')
    .eq('id', fantasy_team_id)
    .eq('user_id', user.id)
    .single()

  if (!team) {
    return NextResponse.json(
      { error: 'Team not found or not owned by you' },
      { status: 403 },
    )
  }

  // ── Load contest ──────────────────────────────────────────────────────────
  const { data: contest } = await supabase
    .from('contests')
    .select('id, name, max_teams, entry_fee, prize_pool')
    .eq('id', contestId)
    .single()

  if (!contest) {
    return NextResponse.json({ error: 'Contest not found' }, { status: 404 })
  }

  // ── Idempotency: already joined? ──────────────────────────────────────────
  const { data: existing } = await supabase
    .from('contest_entries')
    .select('id')
    .eq('contest_id', contestId)
    .eq('fantasy_team_id', fantasy_team_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Already joined this contest' }, { status: 409 })
  }

  // ── Capacity check ────────────────────────────────────────────────────────
  const { count } = await supabase
    .from('contest_entries')
    .select('*', { count: 'exact', head: true })
    .eq('contest_id', contestId)

  if ((count ?? 0) >= contest.max_teams) {
    return NextResponse.json({ error: 'Contest is full' }, { status: 409 })
  }

  const entryFee = Number(contest.entry_fee ?? 0)

  // ── Free contest — direct insert ──────────────────────────────────────────
  if (entryFee === 0) {
    const { error: joinErr } = await supabase
      .from('contest_entries')
      .insert({ contest_id: contestId, fantasy_team_id })

    if (joinErr) {
      console.error('[contests/join] free join error:', joinErr)
      return NextResponse.json({ error: joinErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, joined: true })
  }

  // ── Paid contest — needs admin client for wallet ops ──────────────────────
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }

  // ── Wallet payment ────────────────────────────────────────────────────────
  if (payment_method === 'wallet') {
    const { data: wallet } = await admin
      .from('wallets')
      .select('id, balance')
      .eq('user_id', user.id)
      .single()

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    const balance = Number(wallet.balance)
    if (balance < entryFee) {
      return NextResponse.json(
        { error: 'Insufficient wallet balance', balance, required: entryFee },
        { status: 402 },
      )
    }

    // Debit wallet first
    const newBalance = Math.round((balance - entryFee) * 100) / 100
    const { error: walletErr } = await admin
      .from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', wallet.id)

    if (walletErr) {
      console.error('[contests/join] wallet debit error:', walletErr)
      return NextResponse.json({ error: walletErr.message }, { status: 500 })
    }

    // Record wallet transaction
    await admin.from('wallet_transactions').insert({
      wallet_id:    wallet.id,
      type:         'debit',
      amount:       entryFee,
      description:  `Entry fee — ${contest.name}`,
      reference_id: contestId,
    })

    // Create contest entry
    const { error: joinErr } = await admin
      .from('contest_entries')
      .insert({ contest_id: contestId, fantasy_team_id })

    if (joinErr) {
      // Best-effort refund if entry insert failed
      await admin
        .from('wallets')
        .update({ balance, updated_at: new Date().toISOString() })
        .eq('id', wallet.id)
      await admin.from('wallet_transactions').insert({
        wallet_id:    wallet.id,
        type:         'credit',
        amount:       entryFee,
        description:  `Refund — failed to join ${contest.name}`,
        reference_id: contestId,
      })
      console.error('[contests/join] entry insert error (refunded):', joinErr)
      return NextResponse.json({ error: joinErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, joined: true, wallet_balance: newBalance })
  }

  // ── Gateway payment (Flatpay) ─────────────────────────────────────────────
  const { data: intent, error: intentErr } = await admin
    .from('payment_intents')
    .insert({
      user_id:         user.id,
      contest_id:      contestId,
      fantasy_team_id,
      amount:          entryFee,
      status:          'pending',
      gateway:         'flatpay',
    })
    .select('id')
    .single()

  if (intentErr || !intent) {
    console.error('[contests/join] payment_intent insert error:', intentErr)
    return NextResponse.json({ error: intentErr?.message ?? 'Failed to create payment intent' }, { status: 500 })
  }

  const origin     = process.env.NEXT_PUBLIC_APP_URL
    ?? `https://${request.headers.get('host') ?? 'localhost:3000'}`
  const returnUrl  = `${origin}/contests/${contestId}?payment=confirmed&intent=${intent.id}`
  const webhookUrl = `${origin}/api/webhooks/payment`

  const redirectUrl = buildFlatpayRedirectUrl({
    intentId:    intent.id,
    amountPence: Math.round(entryFee * 100),
    description: `${contest.name} — Entry Fee`,
    returnUrl,
    webhookUrl,
  })

  return NextResponse.json({
    ok:                 true,
    joined:             false,
    payment_intent_id:  intent.id,
    redirect_url:       redirectUrl,
  })
}
