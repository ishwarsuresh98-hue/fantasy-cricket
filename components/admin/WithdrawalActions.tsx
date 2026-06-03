'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function WithdrawalActions({ id, slug }: { id: string; slug: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [notes,   setNotes]   = useState('')
  const [result,  setResult]  = useState<{ status: string; stripe_payout_id?: string } | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  async function act(action: 'approve' | 'reject') {
    setLoading(action)
    setError(null)
    try {
      const res  = await fetch(`/api/admin/withdrawals/${id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, admin_notes: notes || undefined }),
      })
      const data = await res.json() as { ok?: boolean; status?: string; wise_transfer_id?: string; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Failed')
      setResult({ status: data.status ?? action, stripe_payout_id: data.wise_transfer_id })
      router.refresh()
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(null)
    }
  }

  if (result) {
    return (
      <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${
        result.status === 'completed'       ? 'bg-green-50 text-green-700 border border-green-200' :
        result.status === 'manual_required' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
        result.status === 'rejected'        ? 'bg-red-50 text-red-600 border border-red-200' :
        'bg-gray-50 text-gray-600 border border-gray-200'
      }`}>
        {result.status === 'completed'       && `✅ Approved — Stripe payout ${result.stripe_payout_id ?? 'initiated'}`}
        {result.status === 'manual_required' && '⚠️ Approved — Stripe payout failed, manual bank transfer required'}
        {result.status === 'rejected'        && '❌ Rejected — balance refunded to user'}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <textarea
        placeholder="Admin notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:border-[#C9A84C] focus:outline-none focus:ring-1 focus:ring-[#C9A84C] resize-none"
      />
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => act('approve')}
          disabled={!!loading}
          className="flex-1 py-2.5 rounded-xl bg-[#C9A84C] text-black font-black text-sm hover:bg-[#a8892e] transition-colors disabled:opacity-50"
        >
          {loading === 'approve' ? 'Processing…' : '✅ Pay & Approve'}
        </button>
        <button
          onClick={() => act('reject')}
          disabled={!!loading}
          className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-200 font-bold text-sm hover:bg-red-100 transition-colors disabled:opacity-50"
        >
          {loading === 'reject' ? 'Processing…' : '❌ Reject'}
        </button>
      </div>
    </div>
  )
}
