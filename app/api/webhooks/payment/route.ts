import { NextResponse }       from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createHmac }         from 'crypto'

// ── Runtime config ────────────────────────────────────────────────────────────
// Force dynamic so Next.js does not cache this route.
export const dynamic = 'force-dynamic'

// ── HMAC verification ─────────────────────────────────────────────────────────
function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

// ── POST /api/webhooks/payment ────────────────────────────────────────────────
//
// Receives a Flatpay webhook, verifies the HMAC signature, then:
//  1. Confirms the payment_intent row
//  2. Creates a contest_entry for the user
//  3. Logs a debit wallet_transaction for the audit trail
//
// Env vars required:
//   FLATPAY_WEBHOOK_SECRET — HMAC-SHA256 signing secret from Flatpay dashboard
//
// Expected Flatpay payload fields (adjust to match real payload when known):
//   order_id          — the payment_intent.id we created
//   status            — 'paid' | 'confirmed' | 'failed' | 'refunded' | ...
//   gateway_reference — Flatpay's transaction reference

export async function POST(request: Request) {
  // ── Read raw body for HMAC ────────────────────────────────────────────────
  const rawBody  = await request.text()
  const sigHeader = request.headers.get('x-flatpay-signature') ?? ''
  const secret    = process.env.FLATPAY_WEBHOOK_SECRET ?? ''

  if (secret && !verifySignature(rawBody, sigHeader, secret)) {
    console.warn('[webhooks/payment] Invalid HMAC signature — rejected')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // ── Parse payload ─────────────────────────────────────────────────────────
  let payload: {
    order_id?:          string
    status?:            string
    gateway_reference?: string
  }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { order_id: intentId, status, gateway_reference } = payload

  if (!intentId) {
    return NextResponse.json({ error: 'order_id is required' }, { status: 400 })
  }

  // Only act on successful payment events; ack everything else
  if (status !== 'paid' && status !== 'confirmed') {
    console.log(`[webhooks/payment] Skipping status="${status}" for intent ${intentId}`)
    return NextResponse.json({ ok: true, skipped: true })
  }

  // ── Admin client (bypasses RLS) ───────────────────────────────────────────
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }

  // ── Load payment intent ───────────────────────────────────────────────────
  const { data: intent } = await admin
    .from('payment_intents')
    .select('id, user_id, contest_id, fantasy_team_id, amount, status')
    .eq('id', intentId)
    .single()

  if (!intent) {
    console.warn(`[webhooks/payment] payment_intent ${intentId} not found`)
    return NextResponse.json({ error: 'Payment intent not found' }, { status: 404 })
  }

  // ── Idempotency: already processed ───────────────────────────────────────
  if (intent.status === 'confirmed') {
    console.log(`[webhooks/payment] intent ${intentId} already confirmed — ack`)
    return NextResponse.json({ ok: true, already: true })
  }

  // ── Mark intent confirmed ─────────────────────────────────────────────────
  await admin
    .from('payment_intents')
    .update({
      status:            'confirmed',
      gateway_reference: gateway_reference ?? null,
      updated_at:        new Date().toISOString(),
    })
    .eq('id', intentId)

  // ── Create contest entry (if not already there) ───────────────────────────
  const { data: existing } = await admin
    .from('contest_entries')
    .select('id')
    .eq('contest_id', intent.contest_id)
    .eq('fantasy_team_id', intent.fantasy_team_id)
    .maybeSingle()

  if (!existing) {
    const { error: joinErr } = await admin
      .from('contest_entries')
      .insert({
        contest_id:      intent.contest_id,
        fantasy_team_id: intent.fantasy_team_id,
      })

    if (joinErr) {
      console.error('[webhooks/payment] contest_entries insert error:', joinErr)
      // Still return 200 so Flatpay does not retry endlessly; log for manual review
    }
  }

  // ── Audit trail in wallet_transactions (gateway payment, not a balance change) ──
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
      description:  `Gateway payment confirmed (ref: ${gateway_reference ?? intentId})`,
      reference_id: intentId,
    })
  }

  console.log(`[webhooks/payment] Confirmed payment for intent ${intentId} — contest entry created`)
  return NextResponse.json({ ok: true })
}
