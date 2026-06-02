'use client'

import { useState, useCallback } from 'react'
import { useRouter }             from 'next/navigation'
import { cn }                    from '@/lib/utils'
import ContestPaymentWrapper     from '@/components/ContestPaymentWrapper'
import type { ContestCategory }  from '@/types'

interface Props {
  contestId:     string
  fantasyTeamId: string
  entryFee:      number
  walletBalance: number
  clubSlug:      string
  category:      ContestCategory
  /** If set, this is a gameweek contest — redirect to pick-team if no team yet */
  gameweekId?:   string | null
  hasTeam?:      boolean   // user already has a contest_team for this contest
}

type Stage = 'idle' | 'confirm' | 'joining' | 'stripe' | 'joined'

function fmt(n: number): string {
  if (n >= 1000) return `£${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
  return `£${n % 1 === 0 ? n : n.toFixed(2)}`
}

const CATEGORY_ACCENT: Record<ContestCategory, string> = {
  practice:     'bg-gray-900 hover:bg-gray-700',
  h2h:          'bg-blue-600 hover:bg-blue-700',
  small_league: 'bg-green-600 hover:bg-green-700',
  jackpot:      'bg-red-600 hover:bg-red-700',
  mega:         'bg-[#C9A84C] hover:bg-[#a8892e]',
}

export default function ContestDetailJoin({
  contestId,
  fantasyTeamId,
  entryFee,
  walletBalance: initialBalance,
  clubSlug,
  category,
  gameweekId,
  hasTeam = false,
}: Props) {
  const router      = useRouter()
  const [stage, setStage]     = useState<Stage>('idle')
  const [error, setError]     = useState<string | null>(null)
  const [balance, setBalance] = useState(initialBalance)

  const isFree    = entryFee === 0
  const canAfford = balance >= entryFee
  const accentBtn = CATEGORY_ACCENT[category] ?? CATEGORY_ACCENT.mega

  const returnUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/clubs/${clubSlug}/contests/${contestId}?payment=confirmed`
    : `/clubs/${clubSlug}/contests/${contestId}?payment=confirmed`

  const doJoin = useCallback(async (method: 'wallet' | 'gateway') => {
    setStage('joining')
    setError(null)
    try {
      const res  = await fetch(`/api/contests/${contestId}/join`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fantasy_team_id: fantasyTeamId, payment_method: method }),
      })
      const json = await res.json() as { ok?: boolean; joined?: boolean; wallet_balance?: number; error?: string }
      if (!res.ok) {
        if (res.status === 402) { setStage('stripe'); return }
        setStage('confirm')
        setError(json.error ?? 'Something went wrong')
        return
      }
      if (json.joined) {
        if (json.wallet_balance != null) setBalance(json.wallet_balance)
        setStage('joined')
        router.refresh()
      }
    } catch {
      setStage('confirm')
      setError('Network error — please retry')
    }
  }, [contestId, fantasyTeamId, router])

  function handlePrimary() {
    // Gameweek contest with no team picked yet → go to pick-team page
    if (gameweekId && !hasTeam) {
      router.push(`/clubs/${clubSlug}/contests/${contestId}/pick-team`)
      return
    }
    // Gameweek contest with team already picked → use pick-team API for payment
    if (gameweekId && hasTeam) {
      router.push(`/clubs/${clubSlug}/contests/${contestId}/pick-team`)
      return
    }
    // Regular contest
    if (isFree) {
      void doJoin('wallet')
    } else if (canAfford) {
      setStage('confirm')
    } else {
      setStage('stripe')
    }
  }

  // ── Joined state ─────────────────────────────────────────────────────────────
  if (stage === 'joined') {
    return (
      <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-4 flex items-center gap-3">
        <span className="text-2xl">✅</span>
        <div>
          <p className="text-sm font-black text-green-800">You&apos;re in!</p>
          <p className="text-xs text-green-600 mt-0.5">Good luck — your team has been entered.</p>
        </div>
      </div>
    )
  }

  // ── Stripe checkout ───────────────────────────────────────────────────────────
  if (stage === 'stripe') {
    return (
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">Pay by Card</p>
          <p className="text-sm text-gray-500">
            Entry fee: <span className="font-black text-[#C9A84C]">{fmt(entryFee)}</span>
          </p>
        </div>
        <div className="px-5 py-5">
          <ContestPaymentWrapper
            contestId={contestId}
            fantasyTeamId={fantasyTeamId}
            entryFee={entryFee}
            returnUrl={returnUrl}
            onCancel={() => setStage('idle')}
          />
        </div>
      </div>
    )
  }

  // ── Confirm / wallet pay ──────────────────────────────────────────────────────
  if (stage === 'confirm' || stage === 'joining') {
    const isJoining = stage === 'joining'
    return (
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">Confirm Entry</p>
          <div className="flex items-center justify-between mt-2">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Entry fee</p>
              <p className="text-xl font-black text-[#C9A84C]">{fmt(entryFee)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Wallet balance</p>
              <p className={cn('text-xl font-black', canAfford ? 'text-green-600' : 'text-red-500')}>
                £{balance.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 space-y-2.5">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
          )}
          {canAfford && (
            <button
              onClick={() => void doJoin('wallet')}
              disabled={isJoining}
              className="w-full py-3.5 rounded-xl bg-[#C9A84C] text-black font-black text-sm hover:bg-[#a8892e] disabled:opacity-60 transition-colors"
            >
              {isJoining ? 'Joining…' : `Pay from Wallet · £${balance.toFixed(2)}`}
            </button>
          )}
          <button
            onClick={() => setStage('stripe')}
            disabled={isJoining}
            className={cn(
              'w-full py-3.5 rounded-xl font-black text-sm transition-colors disabled:opacity-60',
              canAfford
                ? 'border-2 border-gray-200 text-gray-600 hover:border-[#C9A84C]/40 hover:text-[#C9A84C]'
                : 'bg-[#C9A84C] text-black hover:bg-[#a8892e]',
            )}
          >
            {canAfford ? 'Pay by Card instead' : `Top up & Pay · ${fmt(entryFee)}`}
          </button>
          <button
            onClick={() => setStage('idle')}
            disabled={isJoining}
            className="w-full py-2.5 rounded-xl text-sm text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── Idle — primary CTA ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <button
        onClick={handlePrimary}
        className={cn(
          'w-full py-4 rounded-2xl font-black text-base transition-all shadow-sm hover:shadow-md',
          isFree || category === 'mega'
            ? `${accentBtn} text-black`
            : `${accentBtn} text-[#111111]`,
        )}
      >
        {gameweekId
          ? (hasTeam ? '✏️ Edit Team & Join' : '🏏 Pick Your Team →')
          : isFree
          ? '🎯 Play Free'
          : canAfford
          ? `Join · ${fmt(entryFee)}`
          : `Pay by Card · ${fmt(entryFee)}`}
      </button>

      {!isFree && (
        <p className="text-center text-xs text-gray-400">
          {canAfford
            ? `Wallet: £${balance.toFixed(2)} · sufficient`
            : `Wallet: £${balance.toFixed(2)} · insufficient — card payment required`}
        </p>
      )}
    </div>
  )
}
