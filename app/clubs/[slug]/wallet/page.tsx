import { createClient }   from '@/lib/supabase/server'
import { getClubBySlug }  from '@/lib/club'
import { notFound }       from 'next/navigation'
import WalletTopup        from '@/components/WalletTopup'

export default async function WalletPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── Wallet balance ─────────────────────────────────────────────────────────
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

  // Build return URL for Stripe redirect (server-side: use env or relative path)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const returnUrl = `${appUrl}/clubs/${slug}/wallet?payment=confirmed`

  return (
    <div className="space-y-8 max-w-lg mx-auto">

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
