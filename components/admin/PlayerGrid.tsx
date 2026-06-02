'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { Player } from '@/types'
import PlayerForm from '@/components/admin/PlayerForm'

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30

const ROLE_LABELS: Record<string, string> = {
  batsman:       'Batter',
  bowler:        'Bowler',
  all_rounder:   'All-Rounder',
  wicket_keeper: 'Wicket-Keeper',
}

const ROLE_COLORS: Record<string, string> = {
  batsman:       'bg-blue-100 text-blue-700 border-blue-200',
  bowler:        'bg-red-100 text-[#b5211e] border-red-200',
  all_rounder:   'bg-[#f0f0f0] text-[#C9A84C] border-[#C9A84C]/20',
  wicket_keeper: 'bg-[#fef9ee] text-[#C9A84C] border-[#C9A84C]/30',
}

const ROLE_ORDER = ['wicket_keeper', 'batsman', 'all_rounder', 'bowler'] as const

type RoleFilter = 'all' | typeof ROLE_ORDER[number]
type SortKey = 'name_asc' | 'name_desc' | 'credit_desc' | 'credit_asc'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name_asc',    label: 'Name A–Z' },
  { value: 'name_desc',   label: 'Name Z–A' },
  { value: 'credit_desc', label: 'Credit ↓' },
  { value: 'credit_asc',  label: 'Credit ↑' },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  players: Player[]
  seasonId: string
}

export default function PlayerGrid({ players, seasonId }: Props) {
  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [sortBy,     setSortBy]     = useState<SortKey>('name_asc')
  const [page,       setPage]       = useState(1)

  // Role counts (across all players, independent of search so tabs always show totals)
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: players.length }
    for (const p of players) counts[p.role] = (counts[p.role] ?? 0) + 1
    return counts
  }, [players])

  // Filtered + sorted list
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return players
      .filter((p) => {
        if (roleFilter !== 'all' && p.role !== roleFilter) return false
        if (q && !p.name.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'name_asc':    return a.name.localeCompare(b.name)
          case 'name_desc':   return b.name.localeCompare(a.name)
          case 'credit_desc': return b.price - a.price
          case 'credit_asc':  return a.price - b.price
        }
      })
  }, [players, search, roleFilter, sortBy])

  // Reset to page 1 whenever filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageSlice  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function handleFilterChange(role: RoleFilter) {
    setRoleFilter(role)
    setPage(1)
  }
  function handleSearchChange(val: string) {
    setSearch(val)
    setPage(1)
  }
  function handleSortChange(val: SortKey) {
    setSortBy(val)
    setPage(1)
  }

  return (
    <div className="space-y-4">

      {/* Search + sort row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <Input
            placeholder="Search players by name…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">Sort:</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSortChange(opt.value)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                sortBy === opt.value
                  ? 'bg-[#f0f0f0] text-[#0b0b0b]'
                  : 'bg-[#eeeeee] text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Role filter tabs */}
      <div className="flex gap-2 flex-wrap">
        <RoleTab
          label="All"
          count={roleCounts.all}
          active={roleFilter === 'all'}
          onClick={() => handleFilterChange('all')}
          color="bg-[#f0f0f0] text-[#0b0b0b]"
          inactiveColor="bg-[#eeeeee] text-gray-600 hover:bg-gray-200"
        />
        {ROLE_ORDER.map((role) => (
          <RoleTab
            key={role}
            label={ROLE_LABELS[role]}
            count={roleCounts[role] ?? 0}
            active={roleFilter === role}
            onClick={() => handleFilterChange(role)}
            color={{
              batsman:       'bg-blue-600 text-[#0b0b0b]',
              bowler:        'bg-[#b5211e] text-[#0b0b0b]',
              all_rounder:   'bg-[#f0f0f0] text-[#0b0b0b]',
              wicket_keeper: 'bg-[#a8892e] text-[#0b0b0b]',
            }[role]}
            inactiveColor={{
              batsman:       'bg-blue-50 text-blue-700 hover:bg-blue-100',
              bowler:        'bg-red-50 text-[#b5211e] hover:bg-red-100',
              all_rounder:   'bg-[#f0f0f0] text-[#C9A84C] hover:bg-[#e8e8e8]',
              wicket_keeper: 'bg-[#fef9ee] text-[#C9A84C] hover:bg-[#fef3d0]',
            }[role]}
          />
        ))}
      </div>

      {/* Results summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length === 0
            ? 'No players found'
            : `${filtered.length} player${filtered.length !== 1 ? 's' : ''}${search ? ` matching "${search}"` : ''}`
          }
        </p>
        {filtered.length > PAGE_SIZE && (
          <p className="text-xs text-muted-foreground">
            Page {safePage} of {totalPages}
          </p>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-muted-foreground">No players match your filters.</p>
            <button
              onClick={() => { setSearch(''); setRoleFilter('all') }}
              className="mt-3 text-sm text-[#C9A84C] hover:underline"
            >
              Clear filters
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {pageSlice.map((player) => (
            <PlayerCard key={player.id} player={player} seasonId={seasonId} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination page={safePage} totalPages={totalPages} onPage={setPage} />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RoleTab({
  label, count, active, onClick, color, inactiveColor,
}: {
  label: string; count: number; active: boolean
  onClick: () => void; color: string; inactiveColor: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active ? color : inactiveColor
      }`}
    >
      {label}
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
        active ? 'bg-[#f5f5f5]/25 text-[#0b0b0b]' : 'bg-white/8 text-current'
      }`}>
        {count}
      </span>
    </button>
  )
}

function PlayerCard({ player, seasonId }: { player: Player; seasonId: string }) {
  return (
    <div className={`relative flex flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-[#f8f8f8] ${
      !player.is_active ? 'opacity-60 bg-[#f8f8f8]' : 'bg-[#f0f0f0]'
    }`}>
      {/* Credit pill — top right */}
      <div className="absolute top-3 right-3">
        <span className="inline-flex items-baseline gap-0.5 bg-[#f0f0f0] text-[#0b0b0b] rounded-lg px-2 py-0.5">
          <span className="text-sm font-black tabular-nums">{Number(player.price).toFixed(1)}</span>
          <span className="text-[9px] font-semibold opacity-70 leading-none">cr</span>
        </span>
      </div>

      {/* Name */}
      <p className="font-semibold text-[#0b0b0b] text-sm leading-snug pr-14 min-h-[2.5rem] flex items-start">
        {player.name}
      </p>

      {/* Role badge + inactive */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className={`text-xs border ${ROLE_COLORS[player.role]} hover:${ROLE_COLORS[player.role]}`}>
          {ROLE_LABELS[player.role]}
        </Badge>
        {!player.is_active && (
          <Badge variant="outline" className="text-xs text-gray-400 border-[#d8d8d8]">Inactive</Badge>
        )}
      </div>

      {/* Edit action */}
      <div className="mt-auto pt-1">
        <PlayerForm seasonId={seasonId} player={player} />
      </div>
    </div>
  )
}

function Pagination({
  page, totalPages, onPage,
}: {
  page: number; totalPages: number; onPage: (p: number) => void
}) {
  // Show at most 7 page buttons with ellipsis
  const pages: (number | '…')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
    if (page < totalPages - 2) pages.push('…')
    pages.push(totalPages)
  }

  return (
    <div className="flex items-center justify-center gap-1 pt-2">
      <PageBtn disabled={page === 1} onClick={() => onPage(page - 1)} label="←" />
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground text-sm">…</span>
        ) : (
          <PageBtn
            key={p}
            active={p === page}
            onClick={() => onPage(p as number)}
            label={String(p)}
          />
        )
      )}
      <PageBtn disabled={page === totalPages} onClick={() => onPage(page + 1)} label="→" />
    </div>
  )
}

function PageBtn({
  label, onClick, active = false, disabled = false,
}: {
  label: string; onClick: () => void; active?: boolean; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${
        active
          ? 'bg-[#f0f0f0] text-[#0b0b0b]'
          : disabled
          ? 'text-gray-300 cursor-not-allowed'
          : 'text-gray-600 hover:bg-[#eeeeee]'
      }`}
    >
      {label}
    </button>
  )
}
