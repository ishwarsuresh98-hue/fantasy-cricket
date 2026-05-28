'use client'

/**
 * ContestLobby — Dream11-style contest browser with real-time entry counts,
 * wallet-balance display, countdown timer, tab + category filters, type-specific
 * card designs, and a join flow that checks wallet first then falls back to Stripe.
 */

import { useState, useEffect, useId, useMemo, useCallback } from 'react'
import { createClient }         from '@/lib/supabase/client'
import { cn }                   from '@/lib/utils'
import ContestPaymentWrapper    from '@/components/ContestPaymentWrapper'
import Link                     from 'next/link'
import type { ContestCategory, LobbyContest } from '@/types'

// Re-export so existing imports from this file continue to work
export type { LobbyContest }

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

// ── Per-type visual config ────────────────────────────────────────────────────

interface TypeConfig {
  accent:      string   // Tailwind border/text colour class
  badgeBg:     string   // badge background
  badgeText:   string   // badge text colour
  cardBorder:  string   // card border colour
  cardBg:      string   // card background tint
  stripe:      string   // left accent stripe colour
  icon:        string
  badge:       (maxTeams: number) => string   // badge label
  prizeLabel:  (pool: number, maxTeams: number, fee: number) => string
}

const TYPE_CONFIG: Record<ContestCategory, TypeConfig> = {
  practice: {
    accent:     'text-gray-500',
    badgeBg:    'bg-gray-200',
    badgeText:  'text-gray-600',
    cardBorder: 'border-gray-200',
    cardBg:     'bg-gray-50',
    stripe:     'bg-gray-300',
    icon:       '🎯',
    badge:      () => 'Practice',
    prizeLabel: () => 'Free to play',
  },
  h2h: {
    accent:     'text-blue-600',
    badgeBg:    'bg-blue-100',
    badgeText:  'text-blue-700',
    cardBorder: 'border-blue-200',
    cardBg:     'bg-blue-50/40',
    stripe:     'bg-blue-500',
    icon:       '⚔️',
    badge:      () => '1v1',
    prizeLabel: (pool) => pool > 0 ? `Winner takes ${fmt(pool)}` : 'Winner takes all',
  },
  small_league: {
    accent:     'text-green-600',
    badgeBg:    'bg-green-100',
    badgeText:  'text-green-700',
    cardBorder: 'border-green-200',
    cardBg:     'bg-green-50/30',
    stripe:     'bg-green-500',
    icon:       '👥',
    badge:      (max) => {
      if (max <= 3)  return 'Trio'
      if (max <= 4)  return 'Four Way'
      if (max <= 6)  return 'Small League'
      return 'Big League'
    },
    prizeLabel: (pool, max) => {
      const winners = max <= 3 ? 1 : max <= 4 ? 2 : 3
      return pool > 0 ? `Top ${winners} win` : `Top ${winners} win`
    },
  },
  jackpot: {
    accent:     'text-red-600',
    badgeBg:    'bg-red-100',
    badgeText:  'text-red-700',
    cardBorder: 'border-red-200',
    cardBg:     'bg-red-50/30',
    stripe:     'bg-red-500',
    icon:       '🏆',
    badge:      () => 'Winner Takes All',
    prizeLabel: (pool) => pool > 0 ? `Winner takes ${fmt(pool)}` : 'Winner takes all',
  },
  mega: {
    accent:     'text-orange-600',
    badgeBg:    'bg-orange-100',
    badgeText:  'text-orange-700',
    cardBorder: 'border-orange-200',
    cardBg:     'bg-orange-50/20',
    stripe:     'bg-[#C9A84C]',
    icon:       '🔥',
    badge:      () => 'Mega',
    prizeLabel: (pool, max) => {
      const winners = Math.max(1, Math.floor(max * 0.3))
      return pool > 0 ? `Top ${winners} win` : `Top ${winners} win`
    },
  },
}

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
  { value: 'jackpot',      label: 'Winner Takes All', icon: '🏆' },
  { value: 'practice',     label: 'Practice',     icon: '🎯' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1000) return `£${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
  return `£${n % 1 === 0 ? n : n.toFixed(2)}`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function defaultPayoutSlots(cat: ContestCategory, maxTeams: number): { label: string; pct: number }[] {
  if (cat === 'practice') return []
  if (cat === 'h2h' || cat === 'jackpot') return [{ label: '1st', pct: 85 }]
  if (cat === 'mega') {
    const w = Math.max(1, Math.floor(maxTeams * 0.3))
    if (w === 1) return [{ label: '1st', pct: 75 }]
    return [
      { label: '1st', pct: 40 }, { label: '2nd', pct: 25 }, { label: '3rd', pct: 15 },
      ...(w > 3 ? [{ label: `4th–${ordinal(w)}`, pct: 20 }] : []),
    ]
  }
  // small_league
  if (maxTeams <= 3)  return [{ label: '1st', pct: 75 }]
  if (maxTeams <= 4)  return [{ label: '1st', pct: 65 }, { label: '2nd', pct: 20 }]
  return [{ label: '1st', pct: 50 }, { label: '2nd', pct: 30 }, { label: '3rd', pct: 20 }]
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
      const s = Math.floor(ms / 1000)
      setDisplay(
        `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`,
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetIso])
  return display
}

// ── Join flow ─────────────────────────────────────────────────────────────────

type JoinStage = 'idle' | 'confirm' | 'joining' | 'stripe'
interface JoinState { contestId: string; stage: JoinStage; error: string | null }

// ── Main component ────────────────────────────────────────────────────────────

export default function ContestLobby({
  initialContests,
  walletBalance: initialBalance,
  fantasyTeamId,
  matchLockTime,
  matchId: _matchId,
  clubSlug,
}: ContestLobbyProps) {
  const countdown = useCountdown(matchLockTime)
  const isLocked  = countdown === 'LOCKED'

  const instanceId = useId()
  const [contests, setContests] = useState<LobbyContest[]>(initialContests)
  const [balance,  setBalance]  = useState(initialBalance)
  const [tab,        setTab]        = useState<TabFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [join,     setJoin]     = useState<JoinState | null>(null)

  // Real-time entry count updates — unique channel name per instance to avoid conflicts
  useEffect(() => {
    const supabase = createClient()
    const channel  = supabase.channel(`lobby-entries-${instanceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contest_entries' }, (p) => {
        const { contest_id } = p.new as { contest_id: string }
        setContests((prev) => prev.map((c) => c.id === contest_id ? { ...c, entry_count: c.entry_count + 1 } : c))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'contest_entries' }, (p) => {
        const { contest_id } = p.old as { contest_id: string }
        setContests((prev) => prev.map((c) => c.id === contest_id ? { ...c, entry_count: Math.max(0, c.entry_count - 1) } : c))
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [])

  const filtered = useMemo(() => {
    let list = contests
    if (tab === 'paid') list = list.filter((c) => c.entry_fee > 0)
    if (tab === 'free') list = list.filter((c) => c.entry_fee === 0)
    if (tab === 'my')   list = list.filter((c) => c.is_joined)
    if (typeFilter !== 'all') list = list.filter((c) => c.contest_category === typeFilter)
    return list
  }, [contests, tab, typeFilter])

  function openJoin(contestId: string, entryFee: number) {
    if (!fantasyTeamId || isLocked) return
    if (entryFee === 0) { void doJoin(contestId, 'wallet'); return }
    setJoin({ contestId, stage: balance >= entryFee ? 'confirm' : 'stripe', error: null })
  }

  const doJoin = useCallback(async (contestId: string, method: 'wallet' | 'gateway') => {
    if (!fantasyTeamId) return
    setJoin((prev) => prev ? { ...prev, stage: 'joining', error: null } : null)
    try {
      const res  = await fetch(`/api/contests/${contestId}/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fantasy_team_id: fantasyTeamId, payment_method: method }),
      })
      const json = await res.json() as { ok?: boolean; joined?: boolean; wallet_balance?: number; error?: string }
      if (!res.ok) {
        if (res.status === 402) { setJoin((p) => p ? { ...p, stage: 'stripe', error: null } : null); return }
        setJoin((p) => p ? { ...p, stage: 'confirm', error: json.error ?? 'Something went wrong' } : null)
        return
      }
      if (json.joined) {
        if (json.wallet_balance != null) setBalance(json.wallet_balance)
        setContests((prev) => prev.map((c) => c.id === contestId ? { ...c, is_joined: true } : c))
        setJoin(null)
      }
    } catch {
      setJoin((p) => p ? { ...p, stage: 'confirm', error: 'Network error — please retry' } : null)
    }
  }, [fantasyTeamId])

  const activeContest = join ? contests.find((c) => c.id === join.contestId) : null

  return (
    <div className="space-y-4">

      {/* Wallet + countdown bar */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-gray-100 border border-gray-200 px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Wallet</p>
          <p className="text-2xl font-black text-[#C9A84C] tabular-nums">£{Number(balance).toFixed(2)}</p>
        </div>
        <div className="h-10 w-px bg-gray-300" />
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {isLocked ? 'Status' : 'Closes in'}
          </p>
          <p className={cn('text-xl font-black tabular-nums font-mono', isLocked ? 'text-red-500' : 'text-gray-900')}>
            {countdown}
          </p>
        </div>
      </div>

      {/* Tab filters */}
      <div className="flex gap-1.5 rounded-xl bg-gray-100 border border-gray-200 p-1">
        {TABS.map(({ value, label }) => (
          <button key={value} onClick={() => setTab(value)}
            className={cn('flex-1 py-1.5 rounded-lg text-xs font-bold transition-all',
              tab === value ? 'bg-white text-[#C9A84C] shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700')}>
            {label}
            {value === 'my' && contests.filter((c) => c.is_joined).length > 0 && (
              <span className="ml-1 text-[10px] font-black text-[#C9A84C]">
                ({contests.filter((c) => c.is_joined).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Type chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {TYPE_FILTERS.map(({ value, label, icon }) => (
          <button key={value} onClick={() => setTypeFilter(value)}
            className={cn('flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all whitespace-nowrap',
              typeFilter === value ? 'bg-white border-[#C9A84C] text-gray-900' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-[#C9A84C]/40')}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* No team warning */}
      {!fantasyTeamId && (
        <div className="rounded-xl bg-[#fef9ee] border border-[#C9A84C]/30 px-4 py-3 text-sm text-[#a8892e] font-medium">
          Create a fantasy team first to join contests.
        </div>
      )}

      {/* Contest cards */}
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
              clubSlug={clubSlug ?? ''}
              onToggleExpand={() => setExpanded((prev) => { const n = new Set(prev); n.has(contest.id) ? n.delete(contest.id) : n.add(contest.id); return n })}
              onJoin={() => openJoin(contest.id, contest.entry_fee)}
            />
          ))}
        </div>
      )}

      {/* Join modal */}
      {join && activeContest && (
        <JoinModal
          contest={activeContest}
          walletBalance={balance}
          stage={join.stage}
          error={join.error}
          fantasyTeamId={fantasyTeamId ?? ''}
          clubSlug={clubSlug ?? ''}
          onWallet={() => doJoin(join.contestId, 'wallet')}
          onStripe={() => setJoin((p) => p ? { ...p, stage: 'stripe', error: null } : null)}
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
  clubSlug:       string
  onToggleExpand: () => void
  onJoin:         () => void
}

function ContestCard({ contest, walletBalance, fantasyTeamId, isLocked, expanded, clubSlug, onToggleExpand, onJoin }: ContestCardProps) {
  const cfg       = TYPE_CONFIG[contest.contest_category] ?? TYPE_CONFIG.small_league
  const pct       = contest.max_teams > 0 ? Math.min(100, Math.round((contest.entry_count / contest.max_teams) * 100)) : 0
  const isFull    = contest.entry_count >= contest.max_teams
  const isPaid    = contest.entry_fee > 0
  const canAfford = walletBalance >= contest.entry_fee
  const isPractice = contest.contest_category === 'practice'
  const payoutSlots = defaultPayoutSlots(contest.contest_category, contest.max_teams)
  const prizePool   = Number(contest.prize_pool ?? 0)

  return (
    <div className={cn(
      'rounded-2xl border-2 overflow-hidden shadow-sm transition-all hover:shadow-md relative',
      cfg.cardBorder, cfg.cardBg,
    )}>
      {/* Coloured left stripe */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl', cfg.stripe)} />

      {/* Header: type badge + guaranteed + name */}
      <div className="pl-4 pr-4 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <span className={cn('inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full', cfg.badgeBg, cfg.badgeText)}>
          <span>{cfg.icon}</span>
          {cfg.badge(contest.max_teams)}
        </span>
        {contest.guaranteed_prize && (
          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            ✓ Guaranteed
          </span>
        )}
        {contest.is_joined && (
          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#C9A84C]/10 text-[#C9A84C]">
            ✓ Joined
          </span>
        )}
      </div>

      {/* Main row: prize + actions */}
      <div className="pl-4 pr-4 pb-3 flex items-start justify-between gap-4">
        {/* Left: prize info */}
        <div className="min-w-0">
          {isPractice ? (
            <>
              <p className="text-xl font-black text-gray-500 leading-tight">Free</p>
              <p className="text-xs font-bold text-gray-400 mt-0">Practice contest — no prizes</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-black text-[#C9A84C] leading-tight tabular-nums">
                {prizePool > 0 ? fmt(prizePool) : '—'}
              </p>
              <p className={cn('text-xs font-bold mt-0', cfg.accent)}>
                {cfg.prizeLabel(prizePool, contest.max_teams, contest.entry_fee)}
              </p>
            </>
          )}
          <p className="text-xs text-gray-500 mt-1.5 truncate font-medium">{contest.name}</p>
        </div>

        {/* Right: entry fee + CTA */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {isPaid && (
            <div className="text-right">
              <p className="text-base font-black text-gray-800">{fmt(contest.entry_fee)}</p>
              <p className="text-[10px] text-gray-400">Entry</p>
            </div>
          )}

          {contest.is_joined ? (
            <Link
              href={`/clubs/${clubSlug}/contests/${contest.id}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-green-100 text-green-700 text-xs font-black hover:bg-green-200 transition-colors"
            >
              ✓ View
            </Link>
          ) : isFull ? (
            <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-gray-100 text-gray-400 text-xs font-black cursor-not-allowed">Full</span>
          ) : !fantasyTeamId ? (
            <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-gray-100 text-gray-400 text-xs font-black">Need a team</span>
          ) : isLocked ? (
            <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-gray-100 text-gray-400 text-xs font-black cursor-not-allowed">Locked</span>
          ) : (
            <button onClick={onJoin}
              className={cn('px-4 py-1.5 rounded-xl text-xs font-black transition-all',
                isPaid && !canAfford ? 'bg-[#C9A84C] text-black hover:bg-[#a8892e]' : 'bg-[#C9A84C] text-black hover:bg-[#a8892e]')}>
              {isPaid && !canAfford ? 'Pay by Card' : isPractice ? 'Play Free' : 'Join'}
            </button>
          )}
        </div>
      </div>

      {/* Spots bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">
            <span className="font-bold text-gray-700">{contest.entry_count}</span> / {contest.max_teams} spots
          </span>
          <span className="text-xs text-gray-400">{100 - pct}% left</span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all',
            pct >= 100 ? 'bg-red-400' : pct >= 80 ? 'bg-orange-400' : pct >= 50 ? 'bg-[#C9A84C]' : cfg.stripe)}
            style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Prize breakdown toggle (skip for practice) */}
      {!isPractice && prizePool > 0 && payoutSlots.length > 0 && (
        <>
          <button onClick={onToggleExpand}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-100/50 transition-colors">
            <span>Prize Breakdown</span>
            <span className={cn('transition-transform text-[#C9A84C]', expanded ? 'rotate-180' : '')}>▾</span>
          </button>
          {expanded && (
            <div className="px-4 pb-4 border-t border-gray-100 bg-white/60">
              <div className="pt-3 space-y-2">
                {payoutSlots.map((slot, i) => {
                  const prize = Math.round(prizePool * slot.pct / 100 * 100) / 100
                  const medals = ['🥇', '🥈', '🥉', '🏅']
                  return (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{medals[i] ?? '🏅'}</span>
                        <span className="text-xs font-semibold text-gray-600">{slot.label}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-[#C9A84C]">{fmt(prize)}</span>
                        <span className="text-[10px] text-gray-400 ml-1">({slot.pct}%)</span>
                      </div>
                    </div>
                  )
                })}
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

function JoinModal({ contest, walletBalance, stage, error, fantasyTeamId, clubSlug, onWallet, onStripe, onCancel }: JoinModalProps) {
  const canAfford = walletBalance >= contest.entry_fee
  const isJoining = stage === 'joining'
  const showStripe = stage === 'stripe'
  const returnUrl  = typeof window !== 'undefined'
    ? `${window.location.origin}/clubs/${clubSlug}/contests?payment=confirmed`
    : `/clubs/${clubSlug}/contests?payment=confirmed`

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={showStripe ? undefined : onCancel}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        {showStripe ? (
          <>
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">Pay by Card</p>
              <p className="text-lg font-black text-gray-900 truncate">{contest.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">Entry fee: <span className="font-bold text-[#C9A84C]">{fmt(contest.entry_fee)}</span></p>
            </div>
            <div className="px-5 py-5">
              <ContestPaymentWrapper
                contestId={contest.id} fantasyTeamId={fantasyTeamId}
                entryFee={contest.entry_fee} returnUrl={returnUrl} onCancel={onCancel} />
            </div>
          </>
        ) : (
          <>
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">Confirm Entry</p>
              <p className="text-lg font-black text-gray-900 truncate">{contest.name}</p>
            </div>
            <div className="px-5 py-5 space-y-4">
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
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
              <div className="space-y-2">
                {canAfford && (
                  <button onClick={onWallet} disabled={isJoining}
                    className="w-full py-3 rounded-xl bg-[#C9A84C] text-black font-black text-sm hover:bg-[#a8892e] disabled:opacity-60 transition-colors">
                    {isJoining ? 'Joining…' : `Pay from Wallet · £${walletBalance.toFixed(2)}`}
                  </button>
                )}
                <button onClick={onStripe} disabled={isJoining}
                  className={cn('w-full py-3 rounded-xl font-black text-sm transition-colors disabled:opacity-60',
                    canAfford ? 'border-2 border-gray-200 text-gray-600 hover:border-[#C9A84C]/40 hover:text-[#C9A84C]'
                              : 'bg-[#C9A84C] text-black hover:bg-[#a8892e]')}>
                  {canAfford ? 'Pay by Card instead' : `Top up & Pay · £${contest.entry_fee.toFixed(2)}`}
                </button>
                <button onClick={onCancel} disabled={isJoining}
                  className="w-full py-2.5 rounded-xl text-sm text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors">
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
