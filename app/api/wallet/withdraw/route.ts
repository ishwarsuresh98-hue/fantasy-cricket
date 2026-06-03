import { NextResponse }       from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { amount?: number; account_name?: string; sort_code?: string; account_number?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { amount, account_name, sort_code, account_number } = body

  // ── Validation ────────────────────────────────────────────────────────────
  if (!amount || !Number.isFinite(amount) || amount < 10) {
    return NextResponse.json({ error: 'Minimum withdrawal is £10.' }, { status: 400 })
  }
  if (!account_name?.trim()) {
    return NextResponse.json({ error: 'Account holder name is required.' }, { status: 400 })
  }
  if (!sort_code || !/^\d{2}-\d{2}-\d{2}$/.test(sort_code)) {
    return NextResponse.json({ error: 'Sort code must be in XX-XX-XX format.' }, { status: 400 })
  }
  if (!account_number || !/^\d{8}$/.test(account_number)) {
    return NextResponse.json({ error: 'Account number must be 8 digits.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── Check wallet balance ──────────────────────────────────────────────────
  const { data: wallet, error: walletErr } = await admin
    .from('wallets')
    .select('id, balance')
    .eq('user_id', user.id)
    .maybeSingle()

  if (walletErr || !wallet) {
    return NextResponse.json({ error: 'Wallet not found.' }, { status: 404 })
  }

  const balance = Number(wallet.balance)
  if (amount > balance) {
    return NextResponse.json({ error: `Insufficient balance. Your balance is £${balance.toFixed(2)}.` }, { status: 400 })
  }

  // ── Deduct balance immediately (held in escrow until approved) ────────────
  const newBalance = Math.round((balance - amount) * 100) / 100
  const { error: balanceErr } = await admin
    .from('wallets')
    .update({ balance: newBalance })
    .eq('id', wallet.id)

  if (balanceErr) {
    console.error('[wallet/withdraw] Balance deduction error:', balanceErr)
    return NextResponse.json({ error: 'Failed to update balance.' }, { status: 500 })
  }

  // ── Create withdrawal request ─────────────────────────────────────────────
  const { data: withdrawalReq, error: reqErr } = await admin
    .from('withdrawal_requests')
    .insert({
      user_id:        user.id,
      amount,
      account_name:   account_name.trim(),
      sort_code,
      account_number,
      status:         'pending',
    })
    .select('id')
    .single()

  if (reqErr || !withdrawalReq) {
    // Rollback balance deduction
    await admin.from('wallets').update({ balance }).eq('id', wallet.id)
    console.error('[wallet/withdraw] Request insert error:', reqErr)
    return NextResponse.json({ error: 'Failed to create withdrawal request.' }, { status: 500 })
  }

  // ── Record transaction ────────────────────────────────────────────────────
  await admin.from('wallet_transactions').insert({
    user_id:        user.id,
    type:           'withdrawal',
    amount,
    balance_before: balance,
    balance_after:  newBalance,
    reference:      withdrawalReq.id,
    reference_id:   withdrawalReq.id,
    description:    'Withdrawal request',
    status:         'completed',
  })

  return NextResponse.json({ ok: true, id: withdrawalReq.id })
}
