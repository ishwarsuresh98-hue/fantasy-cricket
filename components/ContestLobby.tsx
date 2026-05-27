'use client'

/**
 * ContestLobby — Dream11-style contest browser with real-time entry counts,
 * wallet-balance display, countdown timer, tab + category filters, prize
 * breakdown toggles, and a join flow that:
 *   1. Deducts from wallet if sufficient balance.
 *   2. Shows Stripe inline checkout if balance is insufficient.
 *
 * Usage (from a server component):
 *   <ContestLobby
 *     initialContests={contests}
 *     walletBalance={wallet.balance}
 *     fantasyTeamId={myTeam?.id ?? null}
 *     matchLockTime={nextMatch?.match_date ?? null}
 *     matchId={matchId}
 *     clubSlug={slug}
 *   />
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient }            from '@/lib/supabase/client'
import { cn }                      from '@/lib/utils'
import ContestPaymentWrapper       from '@/components/ContestPaymentWrapper'
import type { ContestCategory }    from '@/types'

// ── Local types ───────────────────────────────────────────────────────────────

interface LobbyContest {
  id:                string
  name:              string
  type:              'public' | 'private'
  contest_category:  ContestCategory
  entry_fee:         number
  prize_pool:        number
  guaranteed_prize:  boolean
  max_teams:         number
  prize_description: string | null
  entry_count:       number
  is_joined:         boolean
}

interface ContestLobbyProps {
  initialContests: LobbyContest[]
  walletBalance:   number
  fantasyTeamId:   string | null
  matchLockTime:   string | null
  matchId?:        string
  clubSlug?:       string
}

type TabFilter  = 'all' | 'paid' | 'free' | 'my'
type TypeFilter = 'all' | ContestCategory

// ── Static config ─────────────────────────────────────────────────────────────

const TABS: { value: TabFilter; label: string }[] = [
  { value: 'all',  label: 'All'    },
  { value: 'paid', label: 'Paid'   },
  { value: 'free', label: 'Free'   },
  { value: 'my',   label: 'Joined' },
]

const TYPE_FILTERS: { value: TypeFilter; label: string; icon: string }[] = [
  { value: 'all',          label: 'All',          icon: '🏆' },
  { value: 'mega',         label: 'Mega',         icon: '🔥' },
  { value: 'h2h',          label: 'H2H',          icon: '⚔️' },
  { value: 'small_league', label: 'Small League', icon: '👥' },
  { value: 'jackpot',      label: 'Jackpot',      icon: '💰' },
  { value: 'practice',     label: 'Practice',     icon: '🎯' },
]

const CATEGORY_COLOURS: Record<ContestCategory, string> = {
  mega:         'bg-red-500   text-white',
  h2h:          'bg-blue-500  text-white',
  small_league: 'bg-gray-200  text-gray-700',
  jackpot:      'bg-[#C9A84C] text-black',
  practice:     'bg-green-600 text-white',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1000) return `£${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
  return `£${n % 1 === 0 ? n : n.toFixed(2)}`
}

function defaultPayoutSlots(teamCount: number): { rank: number; pct: number }[] {
  if (teamCount <= 1)  return [{ rank: 1, pct: 100 }]
  if (teamCount <= 2)  return [{ rank: 1, pct: 70 }, { rank: 2, pct: 30 }]
  if (teamCount <= 5)  return [{ rank: 1, pct: 60 }, { rank: 2, pct: 25 }, { rank: 3, pct: 15 }]
  if (teamCount <= 10) return [
    { rank: 1, pct: 50 }, { rank: 2, pct: 25 },
    { rank: 3, pct: 15 }, { rank: 4, pct: 10 },
  ]
  return [
    { rank: 1, pct: 40 }, { rank: 2, pct: 25 }, { rank: 3, pct: 15 },
    { rank: 4, pct: 10 }, { rank: 5, pct: 10 },
  ]
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

// ── Countdown hook ────────────────────────────────────────────────────────────

function useCountdown(targetIso: string | null): string {
  const [display, setDisplay] = useState('--:--:--')

  useEffect(() => {
    if (!targetIso) return
    const target = targetIso

    function tick() {
      const ms = new Date(target).getTime() - Date.now()
      if (ms <= 0) { setDisplay('LOCKED'); return }
      const s  = Math.floor(ms / 1000)
      const h  = Math.floor(s / 3600)
      const m  = Math.floor((s % 3600) / 60)
      const sc = s % 60
      setDisplay(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`,
      )
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetIso])

  return display
}

// ── Join flow types ───────────────────────────────────────────────────────────

type JoinStage =
  | 'idle'
  | 'confirm'   // wallet confirm modal
  | 'joining'   // API call in flight
  | 'stripe'    // show Stripe checkout inline (insufficient balance or card choice)

interface JoinState {
  contestId: string
  stage:     JoinStage
  error:     string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ContestLobby({
  initialContests,
  walletBalance:   initialBalance,
  fantasyTeamId,
  matchLockTime,
  matchId:         _matchId,
  clubSlug,
}: ContestLobbyProps) {
  const countdown = useCountdown(matchLockTime)
  const isLocked  = countdown === 'LOCKED'

  // ── Live contest state ────────────────────────────────────────────────────
  const [contests, setContests] = useState<LobbyContest[]>(initialContests)
  const [balance,  setBalance]  = useState(initialBalance)

  // ── Filters ───────────────────────────────────────────────────────────────
  const [tab,        setTab]        = useState<TabFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  // ── UI state ──────────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [join,     setJoin]     = useState<JoinState | null>(null)

  // ── Real-time: contest_entries inserts/deletes ────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const channel  = supabase
      .channel('lobby-entries')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contest_entries' },
        (payload) => {
          const { contest_id } = payload.new as { contest_id: string }
          setContests((prev) =>
            prev.map((c) =>
              c.id === contest_id ? { ...c, entry_count: c.entry_count + 1 } : c,
            ),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'contest_entries' },
        (payload) => {
          const { contest_id } = payload.old as { contest_id: string }
          setContests((prev) =>
            prev.map((c) =>
              c.id === contest_id
                ? { ...c, entry_count: Math.max(0, c.entry_count - 1) }
                : c,
            ),
          )
        },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [])

  // ── Filtered contests ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = contests
    if (tab === 'paid') list = list.filter((c) => c.entry_fee > 0)
    if (tab === 'free') list = list.filter((c) => c.entry_fee === 0)
    if (tab === 'my')   list = list.filter((c) => c.is_joined)
    if (typeFilter !== 'all') list = list.filter((c) => c.contest_category === typeFilter)
    return list
  }, [contests, tab, typeFilter])

  // ── Join handlers ─────────────────────────────────────────────────────────
  function openJoin(contestId: string, entryFee: number) {
    if (!fantasyTeamId) return
    if (isLocked) return
    if (entryFee === 0) {
      void doJoin(contestId, 'wallet')   // free — skip modal
      return
    }
    // If wallet can cover it → confirm modal, else go straight to Stripe
    const stage: JoinStage = balance >= entryFee ? 'confirm' : 'stripe'
    setJoin({ contestId, stage, error: null })
  }

  const doJoin = useCallback(async (contestId: string, method: 'wallet' | 'gateway') => {
    if (!fantasyTeamId) return
    setJoin((prev) => prev ? { ...prev, stage: 'joining', error: null } : null)

    try {
      const res  = await fetch(`/api/contests/${contestId}/join`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fantasy_team_id: fantasyTeamId, payment_method: method }),
      })
      const json = await res.json() as {
        ok?: boolean
        joined?: boolean
        wallet_balance?: number
        redirect_url?: string
        error?: string
        balance?: number
        required?: number
      }

      if (!res.ok) {
        if (res.status === 402) {
          // Insufficient balance — show Stripe checkout
          setJoin((prev) => prev ? { ...prev, stage: 'stripe', error: null } : null)
          return
        }
        setJoin((prev) => prev ? { ...prev, stage: 'confirm', error: json.error ?? 'Something went wrong' } : null)
        return
      }

      if (json.joined) {
        if (json.wallet_balance != null) setBalance(json.wallet_balance)
        setContests((prev) =>
          prev.map((c) =>
            c.id === contestId ? { ...c, is_joined: true } : c,
          ),
        )
        setJoin(null)
      }
    } catch {
      setJoin((prev) => prev ? { ...prev, stage: 'confirm', error: 'Network error — please retry' } : null)
    }
  }, [fantasyTeamId])

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── The active contest being joined ───────────────────────────────────────
  const activeContest = join ? contests.find((c) => c.id === join.contestId) : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Top bar: wallet + countdown ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-gray-100 border border-gray-200 px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Wallet</p>
          <p className="text-2xl font-black text-[#C9A84C] tabular-nums">
            £{balance.toFixed(2)}
          </p>
        </div>
        <div className="h-10 w-px bg-gray-300" />
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {isLocked ? 'Status' : 'Transfers close in'}
          </p>
          <p className={cn(
            'text-xl font-black tabular-nums font-mono',
            isLocked ? 'text-red-500' : 'text-gray-900',
          )}>
            {countdown}
          </p>
        </div>
      </div>

      {/* ── Tab filters ──────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 rounded-xl bg-gray-100 border border-gray-200 p-1">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              'flex-1 py-1.5 rounded-lg text-xs font-bold transition-all',
              tab === value
                ? 'bg-white text-[#C9A84C] shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {label}
            {value === 'my' && contests.filter((c) => c.is_joined).length > 0 && (
              <span className="ml-1 text-[10px] font-black text-[#C9A84C]">
                ({contests.filter((c) => c.is_joined).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Category chips ───────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {TYPE_FILTERS.map(({ value, label, icon }) => (
          <button
            key={value}
            onClick={() => setTypeFilter(value)}
            className={cn(
              'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all whitespace-nowrap',
              typeFilter === value
                ? 'bg-white border-[#C9A84C] text-gray-900'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-[#C9A84C]/40',
            )}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* ── No team warning ──────────────────────────────────────────────── */}
      {!fantasyTeamId && (
        <div className="rounded-xl bg-[#fef9ee] border border-[#C9A84C]/30 px-4 py-3 text-sm text-[#a8892e] font-medium">
          Create a fantasy team first to join contests.
        </div>
      )}

      {/* ── Contest cards ────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-gray-50 border border-gray-200 py-16 text-center">
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-gray-500 text-sm">No contests match this filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((contest) => (
            <ContestCard
              key={contest.id}
              contest={contest}
              walletBalance={balance}
              fantasyTeamId={fantasyTeamId}
              isLocked={isLocked}
              expanded={expanded.has(contest.id)}
              onToggleExpand={() => toggleExpanded(contest.id)}
              onJoin={() => openJoin(contest.id, contest.entry_fee)}
            />
          ))}
        </div>
      )}

      {/* ── Join modal ───────────────────────────────────────────────────── */}
      {join && activeContest && (
        <JoinModal
          contest={activeContest}
          walletBalance={balance}
          stage={join.stage}
          error={join.error}
          fantasyTeamId={fantasyTeamId ?? ''}
          clubSlug={clubSlug ?? ''}
          onWallet={() => doJoin(join.contestId, 'wallet')}
          onStripe={() => setJoin((prev) => prev ? { ...prev, stage: 'stripe', error: null } : null)}
          onCancel={() => setJoin(null)}
        />
      )}
    </div>
  )
}

// ── ContestCard ───────────────────────────────────────────────────────────────

interface ContestCardProps {
  contest:        LobbyContest
  walletBalance:  number
  fantasyTeamId:  string | null
  isLocked:       boolean
  expanded:       boolean
  onToggleExpand: () => void
  onJoin:         () => void
}

function ContestCard({
  contest, walletBalance, fantasyTeamId, isLocked,
  expanded, onToggleExpand, onJoin,
}: ContestCardProps) {
  const pct      = contest.max_teams > 0 ? Math.round((contest.entry_count / contest.max_teams) * 100) : 0
  const isFull   = contest.entry_count >= contest.max_teams
  const isPaid   = contest.entry_fee > 0
  const canAfford = walletBalance >= contest.entry_fee

  const payoutSlots = defaultPayoutSlots(contest.max_teams)
  const prizePool   = Number(contest.prize_pool ?? 0)

  return (
    <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">

      {/* ── Card header strip ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className={cn(
          'text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full',
          CATEGORY_COLOURS[contest.contest_category] ?? 'bg-gray-200 text-gray-600',
        )}>
          {contest.contest_category.replace('_', ' ')}
        </span>
        {contest.guaranteed_prize && (
          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            ✓ Guaranteed
          </span>
        )}
        {contest.type === 'private' && (
          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#fef9ee] text-[#C9A84C]">
            🔒 Private
          </span>
        )}
      </div>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <div className="px-4 pb-3 flex items-start justify-between gap-4">
        {/* Left: prize pool + name */}
        <div className="min-w-0">
          <p className="text-2xl font-black text-[#C9A84C] leading-tight tabular-nums">
            {prizePool > 0 ? fmt(prizePool) : 'Free'}
          </p>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-0">
            Prize Pool
          </p>
          <p className="text-sm font-semibold text-gray-500 mt-1 truncate">{contest.name}</p>
        </div>

        {/* Right: entry fee + join */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {isPaid ? (
            <div className="text-right">
              <p className="text-base font-black text-gray-800">{fmt(contest.entry_fee)}</p>
              <p className="text-[10px] text-gray-400">Entry Fee</p>
            </div>
          ) : (
            <span className="text-xs font-black text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
              FREE
            </span>
          )}

          {contest.is_joined ? (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-green-100 text-green-700 text-xs font-black">
              ✓ Joined
            </span>
          ) : isFull ? (
            <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-gray-100 text-gray-400 text-xs font-black cursor-not-allowed">
              Full
            </span>
          ) : !fantasyTeamId ? (
            <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-gray-100 text-gray-400 text-xs font-black">
              Need a team
            </span>
          ) : isLocked ? (
            <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-gray-100 text-gray-400 text-xs font-black cursor-not-allowed">
              Locked
            </span>
          ) : (
            <button
              onClick={onJoin}
              className={cn(
                'px-4 py-1.5 rounded-xl text-xs font-black transition-all',
                isPaid && !canAfford
                  ? 'bg-[#C9A84C] text-black hover:bg-[#a8892e]'
                  : 'bg-[#C9A84C] text-black hover:bg-[#a8892e]',
              )}
            >
              {isPaid && !canAfford ? 'Pay by Card' : 'Join'}
            </button>
          )}
        </div>
      </div>

      {/* ── Teams fill bar ─────────────────────────────────────────────── */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">
            <span className="font-bold text-gray-700">{contest.entry_count}</span>
            {' '}/ {contest.max_teams} teams
          </span>
          <span className="text-xs text-gray-400">{pct}% full</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              pct >= 100 ? 'bg-red-500' :
              pct >= 80  ? 'bg-orange-400' :
              pct >= 50  ? 'bg-[#C9A84C]' : 'bg-green-400',
            )}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>

      {/* ── Prize breakdown toggle ────────────────────────────────────── */}
      {prizePool > 0 && (
        <>
          <button
            onClick={onToggleExpand}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-gray-100 text-xs font-bold text-[#C9A84C] hover:bg-gray-50 transition-colors"
          >
            <span>Prize Breakdown</span>
            <span className={cn('transition-transform', expanded ? 'rotate-180' : '')}>▾</span>
          </button>

          {expanded && (
            <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
              <div className="pt-3 space-y-2">
                {payoutSlots.map((slot) => {
                  const prize = Math.round((prizePool * slot.pct / 100) * 100) / 100
                  return (
                    <div key={slot.rank} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {slot.rank === 1 ? '🥇' : slot.rank === 2 ? '🥈' : slot.rank === 3 ? '🥉' : '🏅'}
                        </span>
                        <span className="text-xs font-semibold text-gray-600">
                          {ordinal(slot.rank)} place
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-[#C9A84C]">{fmt(prize)}</span>
                        <span className="text-[10px] text-gray-400 ml-1">({slot.pct}%)</span>
                      </div>
                    </div>
                  )
                })}
                {contest.prize_description && (
                  <p className="text-xs text-gray-500 pt-1 border-t border-gray-200 mt-2">
                    {contest.prize_description}
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── JoinModal ─────────────────────────────────────────────────────────────────

interface JoinModalProps {
  contest:       LobbyContest
  walletBalance: number
  stage:         JoinStage
  error:         string | null
  fantasyTeamId: string
  clubSlug:      string
  onWallet:      () => void
  onStripe:      () => void
  onCancel:      () => void
}

function JoinModal({
  contest, walletBalance, stage, error,
  fantasyTeamId, clubSlug,
  onWallet, onStripe, onCancel,
}: JoinModalProps) {
  const canAfford = walletBalance >= contest.entry_fee
  const isJoining = stage === 'joining'
  const showStripe = stage === 'stripe'

  // Build absolute return URL for Stripe
  const returnUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/clubs/${clubSlug}/contests?payment=confirmed`
    : `/clubs/${clubSlug}/contests?payment=confirmed`

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={showStripe ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Stripe checkout ─────────────────────────────────────────── */}
        {showStripe ? (
          <>
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                Pay by Card
              </p>
              <p className="text-lg font-black text-gray-900 truncate">{contest.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">
                Entry fee: <span className="font-bold text-[#C9A84C]">{fmt(contest.entry_fee)}</span>
              </p>
            </div>
            <div className="px-5 py-5">
              <ContestPaymentWrapper
                contestId={contest.id}
                fantasyTeamId={fantasyTeamId}
                entryFee={contest.entry_fee}
                returnUrl={returnUrl}
                onCancel={onCancel}
              />
            </div>
          </>
        ) : (
          <>
            {/* ── Confirm / joining header ────────────────────────────── */}
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                Confirm Entry
              </p>
              <p className="text-lg font-black text-gray-900 truncate">{contest.name}</p>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* Summary row */}
              <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">Entry fee</p>
                  <p className="text-xl font-black text-[#C9A84C]">{fmt(contest.entry_fee)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">Wallet</p>
                  <p className={cn('text-xl font-black', !canAfford ? 'text-red-500' : 'text-green-600')}>
                    £{walletBalance.toFixed(2)}
                  </p>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="space-y-2">
                {canAfford && (
                  <button
                    onClick={onWallet}
                    disabled={isJoining}
                    className="w-full py-3 rounded-xl bg-[#C9A84C] text-black font-black text-sm hover:bg-[#a8892e] disabled:opacity-60 transition-colors"
                  >
                    {isJoining ? 'Joining…' : `Pay from Wallet · £${walletBalance.toFixed(2)}`}
                  </button>
                )}

                <button
                  onClick={onStripe}
                  disabled={isJoining}
                  className={cn(
                    'w-full py-3 rounded-xl font-black text-sm transition-colors disabled:opacity-60',
                    canAfford
                      ? 'border-2 border-gray-200 text-gray-600 hover:border-[#C9A84C]/40 hover:text-[#C9A84C]'
                      : 'bg-[#C9A84C] text-black hover:bg-[#a8892e]',
                  )}
                >
                  {canAfford ? 'Pay by Card instead' : `Top up & Pay · £${contest.entry_fee.toFixed(2)}`}
                </button>

                <button
                  onClick={onCancel}
                  disabled={isJoining}
                  className="w-full py-2.5 rounded-xl text-sm text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
