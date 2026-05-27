'use client'

import { useState, useMemo } from 'react'
import Link                  from 'next/link'
import Image                 from 'next/image'
import { cn }                from '@/lib/utils'
import type { XiContest }    from '@/app/xi/page'

// ── Filter types ──────────────────────────────────────────────────────────────

type FeeTab  = 'all' | 'free' | '1-5' | '5-10' | '10+'
type TypeTab = 'all' | 'mega' | 'h2h' | 'small_league' | 'jackpot' | 'practice'

const FEE_TABS: { value: FeeTab; label: string }[] = [
  { value: 'all',  label: 'All'    },
  { value: 'free', label: 'Free'   },
  { value: '1-5',  label: '£1–£5'  },
  { value: '5-10', label: '£5–£10' },
  { value: '10+',  label: '£10+'   },
]

const TYPE_TABS: { value: TypeTab; label: string; icon: string }[] = [
  { value: 'all',          label: 'All',          icon: '🏆' },
  { value: 'mega',         label: 'Mega',         icon: '🔥' },
  { value: 'h2h',          label: 'H2H',          icon: '⚔️' },
  { value: 'small_league', label: 'Small League', icon: '👥' },
  { value: 'jackpot',      label: 'Jackpot',      icon: '💰' },
  { value: 'practice',     label: 'Practice',     icon: '🎯' },
]

// Map DB contest type strings → TypeTab
const TYPE_MAP: Record<string, TypeTab> = {
  head_to_head:     'h2h',
  small_league:     'small_league',
  mega:             'mega',
  winner_takes_all: 'jackpot',
  practice:         'practice',
  public:           'small_league',
  private:          'small_league',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  if (n >= 1000) return `£${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
  return `£${n % 1 === 0 ? n : n.toFixed(2)}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

const TYPE_BADGE: Record<TypeTab, { bg: string; text: string; label: string }> = {
  all:          { bg: 'bg-gray-200',       text: 'text-gray-700',  label: 'All'          },
  mega:         { bg: 'bg-red-500',        text: 'text-white',     label: 'Mega'         },
  h2h:          { bg: 'bg-blue-500',       text: 'text-white',     label: 'H2H'          },
  small_league: { bg: 'bg-gray-200',       text: 'text-gray-700',  label: 'Small League' },
  jackpot:      { bg: 'bg-[#C9A84C]',     text: 'text-black',     label: 'Jackpot'      },
  practice:     { bg: 'bg-green-500',      text: 'text-white',     label: 'Practice'     },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function XiContestFeed({ contests }: { contests: XiContest[] }) {
  const [feeTab,  setFeeTab]  = useState<FeeTab>('all')
  const [typeTab, setTypeTab] = useState<TypeTab>('all')

  const filtered = useMemo(() => {
    return contests.filter((c) => {
      // Fee filter
      if (feeTab === 'free' && c.entry_fee !== 0)          return false
      if (feeTab === '1-5'  && !(c.entry_fee >= 1  && c.entry_fee <= 5))  return false
      if (feeTab === '5-10' && !(c.entry_fee > 5   && c.entry_fee <= 10)) return false
      if (feeTab === '10+'  && c.entry_fee <= 10)          return false
      // Type filter
      if (typeTab !== 'all') {
        const mapped = TYPE_MAP[c.contest_type] ?? 'small_league'
        if (mapped !== typeTab) return false
      }
      return true
    })
  }, [contests, feeTab, typeTab])

  if (contests.length === 0) {
    return (
      <div className="rounded-2xl bg-gray-50 border border-gray-200 py-16 text-center">
        <p className="text-4xl mb-3">🏏</p>
        <p className="text-gray-500 font-medium">No open contests right now.</p>
        <p className="text-gray-400 text-sm mt-1">Check back once the next fixtures are published.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Fee filter tabs ────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 rounded-xl bg-gray-100 border border-gray-200 p-1 overflow-x-auto scrollbar-none">
        {FEE_TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFeeTab(value)}
            className={cn(
              'flex-shrink-0 flex-1 min-w-[52px] py-1.5 px-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap',
              feeTab === value
                ? 'bg-white text-[#C9A84C] shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Type filter chips ──────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {TYPE_TABS.map(({ value, label, icon }) => (
          <button
            key={value}
            onClick={() => setTypeTab(value)}
            className={cn(
              'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all whitespace-nowrap',
              typeTab === value
                ? 'bg-white border-[#C9A84C] text-gray-900'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-[#C9A84C]/40',
            )}
          >
            <span>{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* ── Empty filter state ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-gray-50 border border-gray-200 py-12 text-center">
          <p className="text-gray-400 text-sm">No contests match this filter.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((contest) => (
            <ContestCard key={contest.id} contest={contest} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Contest card ──────────────────────────────────────────────────────────────

function ContestCard({ contest }: { contest: XiContest }) {
  const spotsLeft  = Math.max(0, contest.max_teams - contest.entry_count)
  const pct        = contest.max_teams > 0
    ? Math.min(100, Math.round((contest.entry_count / contest.max_teams) * 100))
    : 0
  const isFull     = spotsLeft === 0
  const isPaid     = contest.entry_fee > 0
  const typeKey    = (TYPE_MAP[contest.contest_type] ?? 'small_league') as TypeTab
  const badge      = TYPE_BADGE[typeKey]

  // Join href — non-auth users go to login; the login page redirects back after
  const joinHref = contest.club_slug
    ? `/clubs/${contest.club_slug}/contests`
    : '/login'

  return (
    <div className="rounded-2xl bg-white border-2 border-gray-100 overflow-hidden shadow-sm hover:border-[#C9A84C]/30 hover:shadow-md transition-all group">

      {/* ── Club header ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2 border-b border-gray-50">
        {contest.club_logo ? (
          <Image
            src={contest.club_logo}
            alt={contest.club_name}
            width={24}
            height={24}
            className="rounded-full object-contain bg-gray-50 flex-shrink-0"
          />
        ) : (
          <span className="text-base flex-shrink-0">🏏</span>
        )}
        <span className="text-xs font-black text-gray-700 truncate">{contest.club_name}</span>
        <span className={cn('ml-auto text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex-shrink-0', badge.bg, badge.text)}>
          {badge.label}
        </span>
      </div>

      {/* ── Match label ───────────────────────────────────────────────────── */}
      <div className="px-4 pt-2.5 pb-1">
        <p className="text-xs font-semibold text-gray-500 truncate">{contest.match_label}</p>
        {contest.match_date && (
          <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(contest.match_date)}</p>
        )}
      </div>

      {/* ── Prize + fee row ───────────────────────────────────────────────── */}
      <div className="px-4 pt-2 pb-3 flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-black text-[#C9A84C] leading-tight tabular-nums">
            {contest.prize_pool > 0 ? fmtMoney(contest.prize_pool) : 'Free'}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Prize Pool</p>
          {contest.guaranteed && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-600 mt-0.5">
              ✓ Guaranteed
            </span>
          )}
        </div>

        {/* Join button */}
        {isFull ? (
          <span className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-400 text-xs font-black flex-shrink-0">
            Full
          </span>
        ) : (
          <Link
            href={joinHref}
            className="flex-shrink-0 flex flex-col items-end gap-0.5"
          >
            <span className="px-4 py-1.5 rounded-xl bg-[#C9A84C] text-black text-xs font-black hover:bg-[#a8892e] transition-colors">
              {isPaid ? fmtMoney(contest.entry_fee) : 'Free'}
            </span>
            <span className="text-[10px] text-gray-400">Entry</span>
          </Link>
        )}
      </div>

      {/* ── Spots + progress bar ──────────────────────────────────────────── */}
      <div className="px-4 pb-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold text-gray-500">
            <span className={cn('tabular-nums', isFull ? 'text-red-500' : 'text-gray-700')}>{spotsLeft}</span>
            {' '}spots left
          </span>
          <span className="text-[10px] text-gray-400 tabular-nums">{contest.entry_count}/{contest.max_teams}</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              pct >= 100 ? 'bg-red-400' :
              pct >= 80  ? 'bg-orange-400' :
              pct >= 50  ? 'bg-[#C9A84C]' : 'bg-green-400',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
