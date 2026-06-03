import { NextResponse }       from 'next/server'
import Stripe                from 'stripe'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  return key ? new Stripe(key) : null
}

// POST /api/admin/withdrawals/[id]
// Body: { action: 'approve' | 'reject', admin_notes?: string }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // ── Auth — admin only ─────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { action?: string; admin_notes?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { action, admin_notes } = body
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── Load withdrawal request ───────────────────────────────────────────────
  const { data: req, error: reqErr } = await admin
    .from('withdrawal_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (reqErr || !req) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (req.status !== 'pending') {
    return NextResponse.json({ error: `Request is already ${req.status}` }, { status: 409 })
  }

  // ── REJECT — refund balance ───────────────────────────────────────────────
  if (action === 'reject') {
    const { data: wallet } = await admin
      .from('wallets').select('id, balance').eq('user_id', req.user_id).maybeSingle()

    if (wallet) {
      const refunded = Math.round((Number(wallet.balance) + Number(req.amount)) * 100) / 100
      await admin.from('wallets').update({ balance: refunded }).eq('id', wallet.id)
      await admin.from('wallet_transactions').insert({
        user_id:        req.user_id,
        type:           'refund',
        amount:         req.amount,
        balance_before: wallet.balance,
        balance_after:  refunded,
        reference:      req.id,
        reference_id:   `refund_${req.id}`,
        description:    'Withdrawal rejected — balance refunded',
        status:         'completed',
      })
    }

    await admin.from('withdrawal_requests').update({
      status:      'rejected',
      admin_notes: admin_notes ?? null,
      updated_at:  new Date().toISOString(),
    }).eq('id', id)

    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  // ── APPROVE — attempt Stripe payout, fall back to manual ─────────────────
  const stripe = getStripe()
  let stripePayoutId: string | null = null
  let finalStatus: string = 'manual_required'

  if (stripe) {
    try {
      // Sort code: "12-34-56" → "123456"
      const routingNumber = req.sort_code.replace(/-/g, '')
      // Create an external account (bank account) and immediately payout
      const payout = await stripe.payouts.create({
        amount:   Math.round(Number(req.amount) * 100), // pence
        currency: 'gbp',
        method:   'standard',
        metadata: { withdrawal_request_id: id, user_id: req.user_id },
        description: `Withdrawal for request ${id}`,
      })
      stripePayoutId = payout.id
      finalStatus    = 'completed'
      console.log(`[admin/withdrawals] Stripe payout created: ${payout.id}`)
    } catch (e: unknown) {
      console.warn('[admin/withdrawals] Stripe payout failed (marking manual_required):', (e as Error).message)
      finalStatus = 'manual_required'
    }
  } else {
    console.warn('[admin/withdrawals] Stripe not configured — marking manual_required')
  }

  await admin.from('withdrawal_requests').update({
    status:           finalStatus,
    stripe_payout_id: stripePayoutId,
    admin_notes:      admin_notes ?? null,
    updated_at:       new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ ok: true, status: finalStatus, stripe_payout_id: stripePayoutId })
}

// PATCH /api/admin/withdrawals/[id]
// Body: { action: 'mark_paid', admin_notes?: string }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { action?: string; admin_notes?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.action !== 'mark_paid') {
    return NextResponse.json({ error: 'action must be mark_paid' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: req } = await admin
    .from('withdrawal_requests').select('status').eq('id', id).single()

  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (req.status === 'completed') {
    return NextResponse.json({ ok: true, status: 'completed' }) // idempotent
  }

  const { error: updateErr } = await admin
    .from('withdrawal_requests')
    .update({
      status:      'completed',
      admin_notes: body.admin_notes ?? null,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', id)

  if (updateErr) {
    console.error('[admin/withdrawals] mark_paid update error:', updateErr)
    return NextResponse.json({ error: 'Failed to update status.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: 'completed' })
}
