import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Stripe client ─────────────────────────────────────────────────────────────
// Env vars required:
//   STRIPE_SECRET_KEY — secret key from the Stripe dashboard
//   NEXT_PUBLIC_APP_URL — canonical origin for return URLs

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(key)
}

// ── POST /api/create-payment-intent ──────────────────────────────────────────
//
// Body: { contest_id: string; fantasy_team_id: string }
//
// Responses:
//   200  { clientSecret: string; paymentIntentId: string }
//   400  validation error
//   401  unauthenticated
//   402  entry_fee is zero — use the free join path instead
//   409  already joined | contest full
//   500  Stripe or DB error

export async function POST(request: Request) {
  const supabase = await createClient()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { contest_id?: string; fantasy_team_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { contest_id, fantasy_team_id } = body
  if (!contest_id || !fantasy_team_id) {
    return NextResponse.json(
      { error: 'contest_id and fantasy_team_id are required' },
      { status: 400 },
    )
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
    .select('id, name, max_teams, entry_fee')
    .eq('id', contest_id)
    .single()

  if (!contest) {
    return NextResponse.json({ error: 'Contest not found' }, { status: 404 })
  }

  const entryFee = Number(contest.entry_fee ?? 0)
  if (entryFee === 0) {
    return NextResponse.json(
      { error: 'This contest is free — use the join endpoint directly' },
      { status: 402 },
    )
  }

  // ── Idempotency: already joined? ──────────────────────────────────────────
  const { data: existing } = await supabase
    .from('contest_entries')
    .select('id')
    .eq('contest_id', contest_id)
    .eq('fantasy_team_id', fantasy_team_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Already joined this contest' }, { status: 409 })
  }

  // ── Capacity check ────────────────────────────────────────────────────────
  const { count } = await supabase
    .from('contest_entries')
    .select('*', { count: 'exact', head: true })
    .eq('contest_id', contest_id)

  if ((count ?? 0) >= contest.max_teams) {
    return NextResponse.json({ error: 'Contest is full' }, { status: 409 })
  }

  // ── Admin client for payment_intents table ────────────────────────────────
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }

  // ── Create Stripe PaymentIntent ───────────────────────────────────────────
  let stripe: Stripe
  try {
    stripe = getStripe()
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }

  let stripeIntent: Stripe.PaymentIntent
  try {
    stripeIntent = await stripe.paymentIntents.create({
      amount:   Math.round(entryFee * 100),   // Stripe expects pence
      currency: 'gbp',
      metadata: {
        contest_id,
        fantasy_team_id,
        user_id: user.id,
      },
      description: `${contest.name} — Entry Fee`,
      automatic_payment_methods: { enabled: true },
    })
  } catch (e: unknown) {
    console.error('[create-payment-intent] Stripe error:', e)
    return NextResponse.json(
      { error: (e as Error).message ?? 'Stripe error' },
      { status: 500 },
    )
  }

  // ── Persist payment intent row in Supabase ────────────────────────────────
  const { data: intent, error: intentErr } = await admin
    .from('payment_intents')
    .insert({
      user_id:           user.id,
      contest_id,
      fantasy_team_id,
      amount:            entryFee,
      status:            'pending',
      gateway:           'stripe',
      gateway_reference: stripeIntent.id,
    })
    .select('id')
    .single()

  if (intentErr || !intent) {
    console.error('[create-payment-intent] DB insert error:', intentErr)
    // Best-effort: cancel the Stripe intent so it doesn't linger
    await stripe.paymentIntents.cancel(stripeIntent.id).catch(() => null)
    return NextResponse.json(
      { error: intentErr?.message ?? 'Failed to persist payment intent' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    clientSecret:    stripeIntent.client_secret,
    paymentIntentId: intent.id,
  })
}
