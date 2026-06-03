import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClubBySlug }     from '@/lib/club'
import { notFound }          from 'next/navigation'
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
 * Called server-side when Stripe redirects back with ?payment=confirmed.
 * Retrieves the PaymentIntent directly from Stripe and credits the wallet
 * if it hasn't been credited already.
 */
async function confirmTopupFallback(paymentIntentId: string): Promise<string | null> {
  const stripe = getStripe()
  if (!stripe) return 'Stripe is not configured on the server.'

  let intent: Stripe.PaymentIntent
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId)
  } catch (e: unknown) {
    console.error('[wallet/fallback] Failed to retrieve PaymentIntent:', e)
    return 'Could not verify payment with Stripe.'
  }

  if (intent.status !== 'succeeded') return null // not yet succeeded — do nothing

  const { wallet_id, amount: amountStr, user_id } = intent.metadata ?? {}
  if (!wallet_id || !amountStr || !user_id) {
    console.warn('[wallet/fallback] Missing metadata on PaymentIntent', intent.id)
    return null
  }

  const amount = Number(amountStr)
  if (isNaN(amount) || amount <= 0) return null

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e: unknown) {
    console.error('[wallet/fallback] Admin client error:', e)
    return null
  }

  // Idempotency: only credit if this PaymentIntent hasn't been recorded yet
  const { data: existing } = await admin
    .from('wallet_transactions')
    .select('id')
    .eq('reference_id', intent.id)
    .maybeSingle()

  if (existing) return null // already credited (webhook already ran)

  // Fetch wallet and credit it
  const { data: wallet } = await admin
    .from('wallets')
    .select('id, balance')
    .eq('id', wallet_id)
    .eq('user_id', user_id)
    .maybeSingle()

  if (!wallet) {
    console.error('[wallet/fallback] Wallet not found:', wallet_id)
    return null
  }

  const newBalance = Math.round((Number(wallet.balance) + amount) * 100) / 100
  const { error: updateErr } = await admin
    .from('wallets')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', wallet_id)

  if (updateErr) {
    console.error('[wallet/fallback] Balance update error:', updateErr)
    return null
  }

  await admin.from('wallet_transactions').insert({
    wallet_id,
    type:         'credit',
    amount,
    description:  `Wallet top-up via card — £${amount}`,
    reference_id: intent.id,
  })

  console.log(`[wallet/fallback] Credited £${amount} to wallet ${wallet_id} via fallback`)
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

  // ── Fallback confirmation when Stripe redirects back ──────────────────────
  // Stripe appends ?payment_intent=pi_xxx&redirect_status=succeeded to the returnUrl.
  const paymentIntentId  = typeof sp.payment_intent  === 'string' ? sp.payment_intent  : null
  const redirectStatus   = typeof sp.redirect_status  === 'string' ? sp.redirect_status  : null
  let fallbackError: string | null = null
  if (paymentIntentId && redirectStatus === 'succeeded') {
    fallbackError = await confirmTopupFallback(paymentIntentId)
  }

  // ── Wallet balance (read after potential fallback credit) ─────────────────
  const { data: wallet } = await supabase
    .from('wallets')
    .select('id, balance')
    .eq('user_id', user!.id)
    .maybeSingle()

  const balance = (wallet?.balance ?? 0) as number

  // ── Transaction history ────────────────────────────────────────────────────
  const { data: txns } = wallet
    ? await supabase
        .from('wallet_transactions')
        .select('id, type, amount, description, created_at')
        .eq('wallet_id', wallet.id)
        .order('created_at', { ascending: false })
        .limit(30)
    : { data: [] }

  // Build an absolute return URL for Stripe — it rejects relative paths.
  const hdrs = await headers()
  const host = hdrs.get('host') ?? 'the-xi.app'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`
  const returnUrl = `${baseUrl}/clubs/${slug}/wallet`

  const paymentConfirmed = redirectStatus === 'succeeded' && !!paymentIntentId

  return (
    <div className="space-y-8 max-w-lg mx-auto">

      {/* ── Payment confirmed banner ───────────────────────────────────────── */}
      {paymentConfirmed && !fallbackError && (
        <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-4 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="text-sm font-black text-green-800">Payment successful!</p>
            <p className="text-xs text-green-600 mt-0.5">Your wallet balance has been updated.</p>
          </div>
        </div>
      )}
      {fallbackError && (
        <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <p className="text-sm text-red-700">{fallbackError}</p>
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
              const date = new Date(t.created_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
              })
              return (
                <li key={t.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{t.description}</p>
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
