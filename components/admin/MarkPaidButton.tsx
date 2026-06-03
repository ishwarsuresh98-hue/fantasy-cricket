'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function MarkPaidButton({ id }: { id: string }) {
  const router  = useRouter()
  const [open,    setOpen]    = useState(false)
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [done,    setDone]    = useState(false)

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/admin/withdrawals/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'mark_paid', admin_notes: notes || undefined }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Failed')
      setDone(true)
      setOpen(false)
      router.refresh()
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return <span className="text-xs font-bold text-green-600">✅ Marked paid</span>
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-2.5 py-1 rounded-lg bg-[#C9A84C] text-black text-xs font-black hover:bg-[#a8892e] transition-colors whitespace-nowrap"
      >
        Mark as Paid
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-base font-black text-gray-900">Mark as Paid</h3>
            <p className="text-sm text-gray-500">Confirm this withdrawal was paid manually via bank transfer.</p>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                Admin note (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Paid via bank transfer 03/06/2026"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:border-[#C9A84C] focus:outline-none focus:ring-1 focus:ring-[#C9A84C]"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-[#C9A84C] text-black font-black text-sm hover:bg-[#a8892e] transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving…' : 'Confirm — Mark Paid'}
              </button>
              <button
                onClick={() => { setOpen(false); setError(null) }}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
