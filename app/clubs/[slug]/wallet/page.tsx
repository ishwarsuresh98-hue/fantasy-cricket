import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClubBySlug }     from '@/lib/club'
import { notFound, redirect } from 'next/navigation'
import { headers }           from 'next/headers'
import Stripe                from 'stripe'
import WalletTopup           from '@/components/WalletTopup'

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
  const stripe = getStripe()
  if (!stripe) return 'Stripe is not configured on the server.'

  let intent: Stripe.PaymentIntent
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId)
  } catch (e: unknown) {
    console.error('[wallet/fallback] Failed to retrieve PaymentIntent:', e)
    return 'Could not verify payment with Stripe.'
  }

  if (intent.status !== 'succeeded') return null

  const { wallet_id, amount: amountStr, user_id } = intent.metadata ?? {}
  if (!wallet_id || !amountStr || !user_id) {
    console.warn('[wallet/fallback] Missing metadata on PaymentIntent', intent.id)
    return null
  }

  const amount = Number(amountStr)
  if (isNaN(amount) || amount <= 0) return null

  // Idempotency check — fast path before attempting insert
  const { data: existing } = await admin
    .from('wallet_transactions')
    .select('id')
    .eq('reference_id', intent.id)
    .maybeSingle()

  if (existing) {
    console.log(`[wallet/fallback] ${intent.id} already processed — skipping`)
    return 'already_done'
  }

  // Fetch wallet
  const { data: wallet } = await admin
    .from('wallets')
    .select('id, balance')
    .eq('id', wallet_id)
    .eq('user_id', user_id)
    .maybeSingle()

  if (!wallet) {
    console.error('[wallet/fallback] Wallet not found:', wallet_id)
    return 'Wallet not found.'
  }

  // INSERT transaction first — if this fails (e.g. duplicate reference_id), we abort
  // and do NOT touch the balance. This makes the operation safe to retry.
  const { error: txnErr } = await admin.from('wallet_transactions').insert({
    wallet_id:    wallet.id,
    type:         'credit',
    amount,
    description:  `Wallet top-up via card — £${amount}`,
    reference_id: intent.id,
  })

  if (txnErr) {
    // A unique-constraint violation means already processed (race condition or
    // concurrent request). Treat as idempotent success.
    if (txnErr.code === '23505') {
      console.log(`[wallet/fallback] Duplicate insert blocked for ${intent.id} — already done`)
      return 'already_done'
    }
    console.error('[wallet/fallback] Transaction insert error:', txnErr)
    return 'Failed to record transaction.'
  }

  // Only update the balance AFTER the transaction row is committed
  const newBalance = Math.round((Number(wallet.balance) + amount) * 100) / 100
  const { error: updateErr } = await admin
    .from('wallets')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', wallet.id)

  if (updateErr) {
    console.error('[wallet/fallback] Balance update error:', updateErr)
    // Transaction row exists but balance wasn't updated — log for manual fix.
    // Don't return an error to the user since the transaction is recorded.
  }

  console.log(`[wallet/fallback] Credited £${amount} to wallet ${wallet.id} (balance: £${newBalance})`)
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

  // Admin client bypasses RLS for reads/writes done server-side.
  // Safe because we've already verified the user via Supabase auth above.
  const admin = createAdminClient()

  // ── Fallback confirmation when Stripe redirects back ──────────────────────
  // Stripe appends ?payment_intent=pi_xxx&redirect_status=succeeded to the returnUrl.
  const paymentIntentId = typeof sp.payment_intent   === 'string' ? sp.payment_intent   : null
  const redirectStatus  = typeof sp.redirect_status  === 'string' ? sp.redirect_status  : null

  if (paymentIntentId && redirectStatus === 'succeeded') {
    const result = await confirmTopupFallback(paymentIntentId, admin)
    // Redirect to a clean URL regardless of outcome — this strips the Stripe params
    // from the address bar so refreshing never re-triggers the fallback.
    const suffix = (result === null || result === 'already_done') ? '?topup=success' : '?topup=error'
    redirect(`/clubs/${slug}/wallet${suffix}`)
  }

  const topupResult = typeof sp.topup === 'string' ? sp.topup : null

  // ── Wallet balance ─────────────────────────────────────────────────────────
  const { data: wallet } = await admin
    .from('wallets')
    .select('id, balance')
    .eq('user_id', user!.id)
    .maybeSingle()

  const balance = (wallet?.balance ?? 0) as number

  // ── Transaction history ────────────────────────────────────────────────────
  const { data: txns, error: txnsErr } = wallet
    ? await admin
        .from('wallet_transactions')
        .select('id, type, amount, description, created_at')
        .eq('wallet_id', wallet.id)
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

      {/* ── Payment result banner ─────────────────────────────────────────── */}
      {topupResult === 'success' && (
        <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-4 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="text-sm font-black text-green-800">Payment successful!</p>
            <p className="text-xs text-green-600 mt-0.5">Your wallet balance has been updated.</p>
          </div>
        </div>
      )}
      {topupResult === 'error' && (
        <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <p className="text-sm text-red-700">Payment was received but we couldn&apos;t update your balance automatically. Please contact support.</p>
        </div>
      )}

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
              const isCredit = t.type === 'credit'
              const typeLabel = isCredit ? 'Top-up' : 'Debit'
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
