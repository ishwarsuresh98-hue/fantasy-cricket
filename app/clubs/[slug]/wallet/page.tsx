import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClubBySlug }     from '@/lib/club'
import { notFound, redirect } from 'next/navigation'
import { headers }            from 'next/headers'
import Stripe                 from 'stripe'
import WalletTopup            from '@/components/WalletTopup'
import WalletBanner           from '@/components/WalletBanner'
import CleanUrl               from '@/components/CleanUrl'

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key)
}

/**
 * Fallback for when the Stripe webhook hasn't fired yet (or isn't configured).
 *
 * Atomicity strategy: INSERT the transaction row first (the unique constraint on
 * reference_id will reject duplicates), then only update the balance if the
 * insert succeeded. This means a failed/duplicate insert never touches the balance,
 * preventing double-crediting.
 *
 * Returns 'already_done' if the payment was already processed, null on success,
 * or an error message string on failure.
 */
async function confirmTopupFallback(
  paymentIntentId: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<'already_done' | string | null> {
  console.log(`[wallet/fallback] Starting for PI: ${paymentIntentId}`)
  console.log(`[wallet/fallback] Env check — STRIPE_SECRET_KEY set: ${!!process.env.STRIPE_SECRET_KEY}, SUPABASE_SERVICE_ROLE_KEY set: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY}, NEXT_PUBLIC_SUPABASE_URL set: ${!!process.env.NEXT_PUBLIC_SUPABASE_URL}`)

  const stripe = getStripe()
  if (!stripe) {
    console.error('[wallet/fallback] STRIPE_SECRET_KEY not set')
    return 'Stripe is not configured on the server.'
  }

  let intent: Stripe.PaymentIntent
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId)
    console.log(`[wallet/fallback] PI status: ${intent.status}, amount: ${intent.amount}p, metadata:`, intent.metadata)
  } catch (e: unknown) {
    console.error('[wallet/fallback] Failed to retrieve PaymentIntent:', e)
    return 'Could not verify payment with Stripe.'
  }

  if (intent.status !== 'succeeded') {
    console.log(`[wallet/fallback] PI not succeeded (${intent.status}) — skipping`)
    return null
  }

  const { wallet_id, user_id } = intent.metadata ?? {}
  if (!wallet_id || !user_id) {
    console.error('[wallet/fallback] Missing wallet_id or user_id in metadata', intent.metadata)
    return null
  }

  // Use intent.amount (authoritative pence) ÷ 100 = pounds
  const amount = intent.amount / 100
  console.log(`[wallet/fallback] Amount: £${amount}, wallet_id: ${wallet_id}, user_id: ${user_id}`)
  if (amount <= 0) return null

  // Idempotency check — has this PI already been recorded?
  const { data: existing, error: idempotencyErr } = await admin
    .from('wallet_transactions')
    .select('id')
    .eq('reference_id', intent.id)
    .maybeSingle()

  if (idempotencyErr) {
    console.error('[wallet/fallback] STEP: idempotency check FAILED', JSON.stringify({ code: idempotencyErr.code, message: idempotencyErr.message, details: idempotencyErr.details, hint: idempotencyErr.hint }))
  }

  if (existing) {
    console.log(`[wallet/fallback] ${intent.id} already processed — skipping`)
    return 'already_done'
  }

  // Fetch wallet
  const { data: wallet, error: walletErr } = await admin
    .from('wallets')
    .select('id, balance')
    .eq('id', wallet_id)
    .eq('user_id', user_id)
    .maybeSingle()

  if (walletErr) {
    console.error('[wallet/fallback] STEP: wallet lookup FAILED', JSON.stringify({ code: walletErr.code, message: walletErr.message, details: walletErr.details, hint: walletErr.hint }))
    return 'Wallet not found.'
  }
  if (!wallet) {
    console.error(`[wallet/fallback] STEP: wallet lookup — no row found for wallet_id=${wallet_id} user_id=${user_id}`)
    return 'Wallet not found.'
  }
  console.log(`[wallet/fallback] Found wallet id=${wallet.id}, balance=£${wallet.balance}`)

  const balanceBefore = Number(wallet.balance)
  const newBalance    = Math.round((balanceBefore + amount) * 100) / 100

  // INSERT transaction first — if this fails (duplicate reference_id), abort without touching balance
  const { error: txnErr } = await admin.from('wallet_transactions').insert({
    user_id:        user_id,
    type:           'topup',
    amount,
    balance_before: balanceBefore,
    balance_after:  newBalance,
    reference:      intent.id,
    reference_id:   intent.id,
    description:    'Wallet top-up',
    status:         'completed',
  })

  if (txnErr) {
    if (txnErr.code === '23505') {
      // Unique constraint violation — already processed concurrently
      console.log(`[wallet/fallback] Duplicate insert blocked for ${intent.id} — already done`)
      return 'already_done'
    }
    console.error('[wallet/fallback] STEP: transaction insert FAILED', JSON.stringify({ code: txnErr.code, message: txnErr.message, details: txnErr.details, hint: txnErr.hint }))
    return 'Failed to record transaction.'
  }
  console.log(`[wallet/fallback] Transaction row inserted OK`)

  // Update balance AFTER transaction is committed
  console.log(`[wallet/fallback] Updating balance from £${balanceBefore} → £${newBalance}`)

  // Note: updated_at omitted — column may not exist on all deployments.
  // Migration 019 adds it; but the balance update must not fail because of it.
  const { error: updateErr } = await admin
    .from('wallets')
    .update({ balance: newBalance })
    .eq('id', wallet.id)

  if (updateErr) {
    console.error('[wallet/fallback] STEP: wallet balance update FAILED', JSON.stringify({ code: updateErr.code, message: updateErr.message, details: updateErr.details, hint: updateErr.hint }))
    // Transaction row is already committed; balance mismatch needs manual fix.
    // Return null so user sees the success banner — the money IS recorded.
  } else {
    console.log(`[wallet/fallback] Balance updated OK to £${newBalance}`)
  }

  return null
}

export default async function WalletPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const sp = await searchParams

  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Admin client uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS for server-side writes.
  // If this throws, SUPABASE_SERVICE_ROLE_KEY is not set in Vercel environment variables.
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e: unknown) {
    console.error('[wallet/page] createAdminClient FAILED — is SUPABASE_SERVICE_ROLE_KEY set in Vercel env vars?', (e as Error).message)
    throw e
  }

  // ── Fallback confirmation when Stripe redirects back ──────────────────────
  // Stripe appends ?payment_intent=pi_xxx&redirect_status=succeeded to the returnUrl.
  // Only run when BOTH params are explicitly present — never on clean visits.
  const paymentIntentId = typeof sp.payment_intent  === 'string' ? sp.payment_intent  : null
  const redirectStatus  = typeof sp.redirect_status === 'string' ? sp.redirect_status : null

  if (paymentIntentId && redirectStatus === 'succeeded') {
    const result = await confirmTopupFallback(paymentIntentId, admin)
    // Server-side redirect to a clean URL — the ?topup= param is picked up by
    // WalletBanner (client component), then CleanUrl strips it from the address bar.
    const suffix = (result === null || result === 'already_done') ? 'success' : 'error'
    redirect(`/clubs/${slug}/wallet?topup=${suffix}`)
  }

  // ── Wallet balance ─────────────────────────────────────────────────────────
  const { data: wallet } = await admin
    .from('wallets')
    .select('id, balance')
    .eq('user_id', user!.id)
    .maybeSingle()

  const balance = (wallet?.balance ?? 0) as number

  // ── Transaction history ────────────────────────────────────────────────────
  const { data: txns, error: txnsErr } = user
    ? await admin
        .from('wallet_transactions')
        .select('id, type, amount, description, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30)
    : { data: [], error: null }

  if (txnsErr) {
    console.error('[wallet/page] Transaction history query error:', txnsErr)
  }

  // Build an absolute return URL for Stripe — it rejects relative paths.
  const hdrs = await headers()
  const host = hdrs.get('host') ?? 'the-xi.app'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`
  const returnUrl = `${baseUrl}/clubs/${slug}/wallet`

  return (
    <div className="space-y-8 max-w-lg mx-auto">

      {/* Banner reads ?topup= from the live URL (client-side) — never shows on clean visits */}
      <WalletBanner />
      {/* Strips ?topup= from the address bar after mount so refresh doesn't re-show the banner */}
      <CleanUrl />

      {/* ── Balance card ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-[#C9A84C] to-[#a8892e] p-6 text-black shadow-lg shadow-[#C9A84C]/20">
        <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">Your Balance</p>
        <p className="text-5xl font-black tabular-nums">£{balance.toFixed(2)}</p>
        <p className="text-sm opacity-70 mt-2">Used for contest entries</p>
      </div>

      {/* ── Top-up section ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-black text-gray-900">Add Funds</h2>
          <p className="text-sm text-gray-500 mt-0.5">Top up your wallet instantly by card.</p>
        </div>
        <WalletTopup returnUrl={returnUrl} />
      </div>

      {/* ── Transaction history ───────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-black text-gray-900">Transaction History</h2>
        </div>

        {!txns || txns.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-3xl mb-3">💳</p>
            <p className="text-gray-400 text-sm">No transactions yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {txns.map((t) => {
              const isCredit = t.type === 'topup' || t.type === 'credit'
              const typeLabel = t.type === 'topup' ? 'Top-up' : t.type === 'credit' ? 'Top-up' : 'Debit'
              const date = new Date(t.created_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
              })
              return (
                <li key={t.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        isCredit ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-500'
                      }`}>
                        {typeLabel}
                      </span>
                      <p className="text-sm font-semibold text-gray-800 truncate">{t.description}</p>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{date}</p>
                  </div>
                  <span className={`ml-4 flex-shrink-0 text-base font-black tabular-nums ${isCredit ? 'text-green-600' : 'text-red-500'}`}>
                    {isCredit ? '+' : '−'}£{Number(t.amount).toFixed(2)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

    </div>
  )
}
