'use client'

import { useState, useMemo } from 'react'
import { cn }                from '@/lib/utils'
import ContestLobby          from '@/components/ContestLobby'
import type { LobbyContest, MatchGroup } from '@/types'

// ── Filter / sort types ───────────────────────────────────────────────────────

type FilterTab = 'all' | 'free' | 'h2h' | 'small_league' | 'mega' | 'jackpot'
type SortKey   = 'fee_asc' | 'prize_desc' | 'filling'

const FILTER_TABS: { value: FilterTab; label: string; icon: string }[] = [
  { value: 'all',          label: 'All',            icon: '🏆' },
  { value: 'free',         label: 'Free',           icon: '🎯' },
  { value: 'h2h',          label: 'Head to Head',   icon: '⚔️' },
  { value: 'small_league', label: 'Small League',   icon: '👥' },
  { value: 'mega',         label: 'Big League',     icon: '🔥' },
  { value: 'jackpot',      label: 'Winner Takes All', icon: '🏆' },
]

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'fee_asc',    label: 'Entry fee: low → high' },
  { value: 'prize_desc', label: 'Prize pool: high → low' },
  { value: 'filling',    label: 'Filling fast'           },
]

interface Props {
  matchGroups:    MatchGroup[]
  seasonContests: LobbyContest[]
  walletBalance:  number
  fantasyTeamId:  string | null
  matchLockTime:  string | null
  clubSlug:       string
}

export default function ContestPageClient({
  matchGroups,
  seasonContests,
  walletBalance,
  fantasyTeamId,
  matchLockTime,
  clubSlug,
}: Props) {
  const [filter, setFilter] = useState<FilterTab>('all')
  const [sort,   setSort]   = useState<SortKey>('fee_asc')

  function applyFilter(contests: LobbyContest[]): LobbyContest[] {
    if (filter === 'all')  return contests
    if (filter === 'free') return contests.filter((c) => c.entry_fee === 0)
    return contests.filter((c) => c.contest_category === filter)
  }

  function applySort(contests: LobbyContest[]): LobbyContest[] {
    const copy = [...contests]
    if (sort === 'fee_asc')    copy.sort((a, b) => a.entry_fee - b.entry_fee)
    if (sort === 'prize_desc') copy.sort((a, b) => b.prize_pool - a.prize_pool)
    if (sort === 'filling')    copy.sort((a, b) => {
      const pctA = a.max_teams > 0 ? a.entry_count / a.max_teams : 0
      const pctB = b.max_teams > 0 ? b.entry_count / b.max_teams : 0
      return pctB - pctA
    })
    return copy
  }

  const filteredGroups = useMemo(() => {
    return matchGroups
      .map((g) => ({ ...g, contests: applySort(applyFilter(g.contests)) }))
      .filter((g) => g.contests.length > 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchGroups, filter, sort])

  const filteredSeason = useMemo(
    () => applySort(applyFilter(seasonContests)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seasonContests, filter, sort],
  )

  const totalShown = filteredGroups.reduce((s, g) => s + g.contests.length, 0) + filteredSeason.length

  return (
    <div className="space-y-6">
      {/* ── Filter tabs ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {FILTER_TABS.map(({ value, label, icon }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={cn(
              'flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all whitespace-nowrap',
              filter === value
                ? 'bg-[#C9A84C] border-[#C9A84C] text-black shadow-sm'
                : 'bg-white border-gray-200 text-gray-600 hover:border-[#C9A84C]/40 hover:text-gray-800',
            )}
          >
            <span>{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* ── Sort selector ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400 flex-shrink-0">Sort:</span>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {SORT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setSort(value)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap',
                sort === value
                  ? 'bg-gray-900 border-gray-900 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {totalShown === 0 && (
        <div className="rounded-2xl bg-gray-50 border border-gray-200 py-16 text-center">
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-gray-500 font-medium">No contests match this filter.</p>
          <p className="text-gray-400 text-sm mt-1">Try a different category or check back soon.</p>
        </div>
      )}

      {/* ── Match-grouped sections ──────────────────────────────────────────── */}
      {filteredGroups.map((group) => (
        <MatchSection key={group.matchId} group={group}
          walletBalance={walletBalance} fantasyTeamId={fantasyTeamId}
          clubSlug={clubSlug} />
      ))}

      {/* ── Season-level contests ───────────────────────────────────────────── */}
      {filteredSeason.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400 flex-shrink-0">Season Contests</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          {/* Render via standalone ContestLobby without the top bar / full filter UI */}
          <div className="space-y-3">
            {filteredSeason.map((c) => (
              <SeasonContestCard key={c.id} contest={c} walletBalance={walletBalance}
                fantasyTeamId={fantasyTeamId} matchLockTime={matchLockTime} clubSlug={clubSlug} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Match section ─────────────────────────────────────────────────────────────

function MatchSection({ group, walletBalance, fantasyTeamId, clubSlug }: {
  group: MatchGroup
  walletBalance: number
  fantasyTeamId: string | null
  clubSlug: string
}) {
  const date = new Date(group.matchDate).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'long',
  })

  return (
    <div className="space-y-3">
      {/* Match header */}
      <div className={cn(
        'rounded-2xl px-5 py-4',
        group.isNext
          ? 'bg-gradient-to-r from-[#C9A84C] to-[#a8892e] text-black'
          : 'bg-gray-100 border border-gray-200',
      )}>
        {group.isNext && (
          <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-0.5">
            Next Match · GW{group.matchNumber}
          </p>
        )}
        {!group.isNext && (
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">
            GW{group.matchNumber}
          </p>
        )}
        <p className={cn('text-lg font-black', group.isNext ? '' : 'text-gray-800')}>
          vs {group.opponent}
        </p>
        <p className={cn('text-sm mt-0.5', group.isNext ? 'opacity-80' : 'text-gray-500')}>
          {date}{group.venue ? ` · ${group.venue}` : ''}
        </p>
        <p className={cn('text-xs mt-1 font-semibold', group.isNext ? 'opacity-60' : 'text-gray-400')}>
          {group.contests.length} contest{group.contests.length !== 1 ? 's' : ''} available
        </p>
      </div>

      {/* Contests for this match — rendered via ContestLobby (handles join modal) */}
      <ContestLobby
        initialContests={group.contests}
        walletBalance={walletBalance}
        fantasyTeamId={fantasyTeamId}
        matchLockTime={group.matchDate}
        clubSlug={clubSlug}
      />
    </div>
  )
}

// ── Season contest card (simplified, no lobby wrapper) ────────────────────────

function SeasonContestCard({ contest, walletBalance, fantasyTeamId, matchLockTime, clubSlug }: {
  contest: LobbyContest
  walletBalance: number
  fantasyTeamId: string | null
  matchLockTime: string | null
  clubSlug: string
}) {
  return (
    <ContestLobby
      initialContests={[contest]}
      walletBalance={walletBalance}
      fantasyTeamId={fantasyTeamId}
      matchLockTime={matchLockTime}
      clubSlug={clubSlug}
    />
  )
}
