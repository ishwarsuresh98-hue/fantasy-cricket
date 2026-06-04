'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Props {
  contestId:       string
  fantasyTeamId:   string | null
  alreadyJoined:   boolean
  isFull:          boolean
  entryFee:        number
  walletBalance:   number
  slug:            string   // club slug for the wallet link
}

export default function JoinContestButton({
  contestId,
  fantasyTeamId,
  alreadyJoined,
  isFull,
  entryFee,
  walletBalance,
  slug,
}: Props) {
  const router = useRouter()
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [showConfirm,   setShowConfirm]   = useState(false)

  const isPaid        = entryFee > 0
  const canAfford     = walletBalance >= entryFee
  const shortfall     = Math.max(0, entryFee - walletBalance)
  const balanceAfter  = walletBalance - entryFee

  if (alreadyJoined) {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 text-xs font-bold">
        ✓ Joined
      </span>
    )
  }

  if (isFull) {
    return (
      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-[#eeeeee] text-gray-400 text-xs font-bold cursor-not-allowed">
        Full
      </span>
    )
  }

  if (!fantasyTeamId) {
    return (
      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-[#eeeeee] text-gray-400 text-xs font-bold">
        Need a team
      </span>
    )
  }

  // Paid contest — insufficient funds
  if (isPaid && !canAfford) {
    return (
      <div className="space-y-1">
        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-600 border border-orange-200 text-xs font-bold cursor-not-allowed">
          Insufficient funds
        </span>
        <p className="text-[10px] text-orange-600">
          You need <span className="font-bold">£{shortfall.toFixed(2)}</span> more —{' '}
          <Link href={`/clubs/${slug}/wallet`} className="underline font-bold hover:text-orange-800">
            top up your wallet
          </Link>
        </p>
      </div>
    )
  }

  async function handleJoin() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const { error: err } = await supabase.from('contest_entries').insert({
      contest_id:      contestId,
      fantasy_team_id: fantasyTeamId,
    })

    if (err) { setError(err.message); setLoading(false); setShowConfirm(false); return }
    setLoading(false)
    setShowConfirm(false)
    router.refresh()
  }

  function handleClick() {
    if (isPaid) {
      setShowConfirm(true)
    } else {
      handleJoin()
    }
  }

  return (
    <>
      <div>
        <button
          onClick={handleClick}
          disabled={loading}
          className={cn(
            'px-4 py-1.5 rounded-lg text-xs font-bold transition-all',
            loading
              ? 'bg-[#eeeeee] text-gray-400 cursor-wait'
              : isPaid
              ? 'bg-[#C9A84C] text-black hover:bg-[#a8892e] shadow-sm'
              : 'bg-[#f0f0f0] text-[#0b0b0b] hover:bg-[#fafafa]',
          )}
        >
          {loading ? 'Joining…' : isPaid ? `Join — £${entryFee.toFixed(2)}` : 'Join Free'}
        </button>
        {error && <p className="mt-1 text-[10px] text-red-500">{error}</p>}
      </div>

      {/* ── Confirmation modal ──────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-[#C9A84C] to-[#f5d97a]" />
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🏆</span>
                <div>
                  <h3 className="text-base font-black text-gray-900">Confirm Entry</h3>
                  <p className="text-xs text-gray-500">This will deduct from your wallet</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Entry fee</span>
                  <span className="font-black text-gray-900">£{entryFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Current balance</span>
                  <span className="font-semibold text-gray-700">£{walletBalance.toFixed(2)}</span>
                </div>
                <div className="h-px bg-gray-200" />
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Balance after entry</span>
                  <span className={`font-black ${balanceAfter < 0 ? 'text-red-500' : 'text-[#C9A84C]'}`}>
                    £{balanceAfter.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleJoin}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl bg-[#C9A84C] text-black font-black text-sm hover:bg-[#a8892e] transition-colors disabled:opacity-60"
                >
                  {loading ? 'Confirming…' : 'Confirm Entry'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
