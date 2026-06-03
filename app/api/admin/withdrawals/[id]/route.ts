import { NextResponse }       from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWisePayout }    from '@/lib/wise'

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

  // ── APPROVE — attempt Wise payout, fall back to manual_required ──────────
  let wiseTransferId: string | null = null
  let finalStatus: string = 'manual_required'

  if (process.env.WISE_API_TOKEN) {
    try {
      const result = await sendWisePayout({
        amountGbp:         Number(req.amount),
        accountHolderName: req.account_name,
        sortCode:          req.sort_code,
        accountNumber:     req.account_number,
        reference:         `withdrawal-${id}`,
      })
      wiseTransferId = String(result.transferId)
      finalStatus    = 'completed'
      console.log(`[admin/withdrawals] Wise transfer created: ${result.transferId} (${result.status})`)
    } catch (e: unknown) {
      console.warn('[admin/withdrawals] Wise payout failed (marking manual_required):', (e as Error).message)
      finalStatus = 'manual_required'
    }
  } else {
    console.warn('[admin/withdrawals] WISE_API_TOKEN not set — marking manual_required')
  }

  await admin.from('withdrawal_requests').update({
    status:           finalStatus,
    stripe_payout_id: wiseTransferId,  // reusing column to store Wise transfer ID
    admin_notes:      admin_notes ?? null,
    updated_at:       new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ ok: true, status: finalStatus, wise_transfer_id: wiseTransferId })
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
