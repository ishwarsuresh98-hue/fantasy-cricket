import { createAdminClient } from '@/lib/supabase/admin'
import { getClubBySlug }     from '@/lib/club'
import { notFound }          from 'next/navigation'
import { cn }                from '@/lib/utils'
import WithdrawalActions     from '@/components/admin/WithdrawalActions'

const STATUS_STYLE: Record<string, string> = {
  pending:         'bg-yellow-100 text-yellow-800',
  completed:       'bg-green-100 text-green-700',
  rejected:        'bg-red-100 text-red-600',
  manual_required: 'bg-orange-100 text-orange-700',
}

const STATUS_LABEL: Record<string, string> = {
  pending:         'Pending',
  completed:       'Completed',
  rejected:        'Rejected',
  manual_required: 'Manual Required',
}

export default async function AdminWithdrawalsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const admin = createAdminClient()

  const { data: requests } = await admin
    .from('withdrawal_requests')
    .select('*, profiles:user_id(display_name, email:id)')
    .order('created_at', { ascending: false })

  // Fetch profile display names separately (simpler than a join)
  const userIds = [...new Set((requests ?? []).map((r) => r.user_id))]
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name]))

  const pending    = (requests ?? []).filter((r) => r.status === 'pending')
  const historical = (requests ?? []).filter((r) => r.status !== 'pending')

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-black text-[#C9A84C]">Withdrawal Requests</h2>
        <p className="text-sm text-gray-500 mt-1">Review and approve or reject user withdrawal requests.</p>
      </div>

      {/* ── Pending ────────────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-3">
          Pending ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 border border-gray-200 py-10 text-center">
            <p className="text-gray-400 text-sm">No pending withdrawal requests.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((req) => (
              <WithdrawalCard
                key={req.id}
                req={req}
                displayName={profileMap[req.user_id] ?? 'Unknown'}
                slug={slug}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── History ───────────────────────────────────────────────────────── */}
      {historical.length > 0 && (
        <section>
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-3">
            History ({historical.length})
          </h3>
          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-500 text-xs uppercase">User</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Amount</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Status</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Date</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Stripe Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {historical.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{profileMap[req.user_id] ?? 'Unknown'}</td>
                    <td className="px-4 py-3 font-black text-gray-900">£{Number(req.amount).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs font-bold px-2 py-0.5 rounded', STATUS_STYLE[req.status] ?? 'bg-gray-100 text-gray-600')}>
                        {STATUS_LABEL[req.status] ?? req.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(req.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono truncate max-w-[160px]">
                      {req.stripe_payout_id ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function WithdrawalCard({
  req,
  displayName,
  slug,
}: {
  req: Record<string, unknown>
  displayName: string
  slug: string
}) {
  const date = new Date(req.created_at as string).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-black text-gray-900">{displayName}</p>
          <p className="text-xs text-gray-400 mt-0.5">{date}</p>
        </div>
        <p className="text-2xl font-black text-[#C9A84C]">£{Number(req.amount).toFixed(2)}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-xl px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Account Name</p>
          <p className="text-sm font-semibold text-gray-800 mt-0.5">{req.account_name as string}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Sort Code</p>
          <p className="text-sm font-semibold text-gray-800 mt-0.5 font-mono">{req.sort_code as string}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Account Number</p>
          <p className="text-sm font-semibold text-gray-800 mt-0.5 font-mono">{req.account_number as string}</p>
        </div>
      </div>

      <WithdrawalActions id={req.id as string} slug={slug} />
    </div>
  )
}
