import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'

// Force dynamic — this route must never be cached or statically rendered.
export const dynamic = 'force-dynamic'

// ── Stripe client ─────────────────────────────────────────────────────────────
// Env vars required:
//   STRIPE_SECRET_KEY         — secret key from Stripe dashboard
//   STRIPE_WEBHOOK_SECRET     — signing secret for this endpoint (whsec_…)
//     Get it by running: stripe listen --forward-to localhost:3000/api/webhook
//     In production: add the endpoint in the Stripe dashboard → Developers → Webhooks

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(key)
}

// ── POST /api/webhook ─────────────────────────────────────────────────────────
//
// Handles Stripe webhook events. Stripe signs each request; we verify the
// signature before processing so the endpoint cannot be spoofed.
//
// Handled events:
//   payment_intent.succeeded      → confirm the intent row, create contest_entry
//   payment_intent.payment_failed → mark intent as failed

export async function POST(request: Request) {
  // ── Read raw body — required for Stripe signature verification ────────────
  const rawBody  = await request.text()
  const sigHeader = request.headers.get('stripe-signature') ?? ''
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

  if (!webhookSecret) {
    console.error('[webhook/stripe] STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 })
  }

  // ── Verify signature ──────────────────────────────────────────────────────
  let event: Stripe.Event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(rawBody, sigHeader, webhookSecret)
  } catch (e: unknown) {
    console.warn('[webhook/stripe] Invalid signature:', (e as Error).message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // ── Admin Supabase client (bypasses RLS) ──────────────────────────────────
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }

  // ── Route event types ─────────────────────────────────────────────────────
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const stripeIntent = event.data.object as Stripe.PaymentIntent
      if (stripeIntent.metadata?.type === 'wallet_topup') {
        await handleWalletTopup(admin, stripeIntent)
      } else {
        await handlePaymentSucceeded(admin, stripeIntent)
      }
      break
    }

    case 'payment_intent.payment_failed': {
      const stripeIntent = event.data.object as Stripe.PaymentIntent
      await handlePaymentFailed(admin, stripeIntent)
      break
    }

    default:
      // Acknowledge events we don't handle — Stripe will stop retrying
      console.log(`[webhook/stripe] Unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}

// ── Handler: payment succeeded ────────────────────────────────────────────────
async function handlePaymentSucceeded(
  admin: ReturnType<typeof createAdminClient>,
  stripeIntent: Stripe.PaymentIntent,
) {
  const stripeIntentId = stripeIntent.id

  // Find our payment_intent row by gateway_reference (= Stripe PI id)
  const { data: intent } = await admin
    .from('payment_intents')
    .select('id, user_id, contest_id, fantasy_team_id, amount, status')
    .eq('gateway_reference', stripeIntentId)
    .eq('gateway', 'stripe')
    .maybeSingle()

  if (!intent) {
    console.warn(`[webhook/stripe] No payment_intent found for Stripe PI ${stripeIntentId}`)
    return
  }

  // Idempotency guard
  if (intent.status === 'confirmed') {
    console.log(`[webhook/stripe] Intent ${intent.id} already confirmed — skip`)
    return
  }

  // Mark confirmed
  await admin
    .from('payment_intents')
    .update({
      status:     'confirmed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', intent.id)

  // Create contest entry (guarded against duplicates)
  const { data: existingEntry } = await admin
    .from('contest_entries')
    .select('id')
    .eq('contest_id', intent.contest_id)
    .eq('fantasy_team_id', intent.fantasy_team_id)
    .maybeSingle()

  if (!existingEntry) {
    const { error: joinErr } = await admin
      .from('contest_entries')
      .insert({
        contest_id:      intent.contest_id,
        fantasy_team_id: intent.fantasy_team_id,
      })

    if (joinErr) {
      console.error('[webhook/stripe] Failed to create contest_entry:', joinErr)
    }
  }

  // Audit trail in wallet_transactions (records the card charge, not a balance change)
  const { data: wallet } = await admin
    .from('wallets')
    .select('id')
    .eq('user_id', intent.user_id)
    .maybeSingle()

  if (wallet) {
    await admin.from('wallet_transactions').insert({
      wallet_id:    wallet.id,
      type:         'debit',
      amount:       Number(intent.amount),
      description:  `Stripe card payment confirmed (ref: ${stripeIntentId})`,
      reference_id: intent.id,
    })
  }

  console.log(`[webhook/stripe] Confirmed intent ${intent.id} — contest entry created`)
}

// ── Handler: wallet top-up ────────────────────────────────────────────────────
async function handleWalletTopup(
  admin: ReturnType<typeof createAdminClient>,
  stripeIntent: Stripe.PaymentIntent,
) {
  const { wallet_id, amount: amountStr, user_id } = stripeIntent.metadata ?? {}
  if (!wallet_id || !amountStr || !user_id) {
    console.warn('[webhook/stripe] wallet_topup missing metadata fields', stripeIntent.metadata)
    return
  }

  const amount = Number(amountStr)
  if (isNaN(amount) || amount <= 0) {
    console.warn('[webhook/stripe] wallet_topup invalid amount:', amountStr)
    return
  }

  // Idempotency: skip if we've already recorded this Stripe PI as a credit
  const { data: existing } = await admin
    .from('wallet_transactions')
    .select('id')
    .eq('reference_id', stripeIntent.id)
    .maybeSingle()

  if (existing) {
    console.log(`[webhook/stripe] wallet_topup ${stripeIntent.id} already processed — skip`)
    return
  }

  // Increment wallet balance atomically
  const { data: wallet } = await admin
    .from('wallets')
    .select('id, balance')
    .eq('id', wallet_id)
    .eq('user_id', user_id)
    .maybeSingle()

  if (!wallet) {
    console.error('[webhook/stripe] wallet not found:', wallet_id)
    return
  }

  const newBalance = Math.round((Number(wallet.balance) + amount) * 100) / 100
  const { error: updateErr } = await admin
    .from('wallets')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', wallet_id)

  if (updateErr) {
    console.error('[webhook/stripe] wallet balance update error:', updateErr)
    return
  }

  // Record the transaction
  await admin.from('wallet_transactions').insert({
    wallet_id,
    type:         'credit',
    amount,
    description:  `Wallet top-up via card — £${amount}`,
    reference_id: stripeIntent.id,
  })

  console.log(`[webhook/stripe] Credited £${amount} to wallet ${wallet_id} (balance: £${newBalance})`)
}

// ── Handler: payment failed ───────────────────────────────────────────────────
async function handlePaymentFailed(
  admin: ReturnType<typeof createAdminClient>,
  stripeIntent: Stripe.PaymentIntent,
) {
  const { error } = await admin
    .from('payment_intents')
    .update({
      status:     'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('gateway_reference', stripeIntent.id)
    .eq('gateway', 'stripe')

  if (error) {
    console.error('[webhook/stripe] Failed to mark intent as failed:', error)
  } else {
    console.log(`[webhook/stripe] Marked intent failed for Stripe PI ${stripeIntent.id}`)
  }
}
