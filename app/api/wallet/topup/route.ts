import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Stripe client ─────────────────────────────────────────────────────────────
// Env vars required:
//   STRIPE_SECRET_KEY — secret key from Stripe dashboard

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(key)
}

// ── POST /api/wallet/topup ────────────────────────────────────────────────────
//
// Body: { amount: number }   (amount in pounds, e.g. 5 | 10 | 20 | 50)
//
// Responses:
//   200  { clientSecret: string }
//   400  validation error
//   401  unauthenticated
//   503  Stripe or DB unavailable

const ALLOWED_AMOUNTS = [5, 10, 20, 50]

export async function POST(request: Request) {
  const supabase = await createClient()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { amount?: number }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const amount = Number(body.amount)
  if (!ALLOWED_AMOUNTS.includes(amount)) {
    return NextResponse.json(
      { error: `amount must be one of: ${ALLOWED_AMOUNTS.join(', ')}` },
      { status: 400 },
    )
  }

  // ── Resolve wallet id ─────────────────────────────────────────────────────
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }

  const { data: wallet } = await admin
    .from('wallets')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  // If wallet doesn't exist yet, create it
  const walletId = wallet?.id ?? (await admin
    .from('wallets')
    .insert({ user_id: user.id, balance: 0 })
    .select('id')
    .single()
  ).data?.id

  if (!walletId) {
    return NextResponse.json({ error: 'Could not resolve wallet' }, { status: 500 })
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
      amount:   amount * 100,   // Stripe expects pence
      currency: 'gbp',
      metadata: {
        type:      'wallet_topup',
        user_id:   user.id,
        wallet_id: walletId,
        amount:    String(amount),
      },
      description:               `Wallet top-up — £${amount}`,
      automatic_payment_methods: { enabled: true },
    })
  } catch (e: unknown) {
    console.error('[wallet/topup] Stripe error:', e)
    return NextResponse.json(
      { error: (e as Error).message ?? 'Stripe error' },
      { status: 500 },
    )
  }

  return NextResponse.json({ clientSecret: stripeIntent.client_secret })
}
