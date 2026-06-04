'use client'

import { useState, useMemo, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Season, Match, Player, FantasyTeam, FantasySelection } from '@/types'
import { PLAYER_ROLE_LABELS } from '@/lib/scoring'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import PitchView from '@/components/team/PitchView'

interface TeamBuilderProps {
  season: Season
  nextMatch: Match
  players: Player[]
  myTeam: FantasyTeam | null
  existingSelections: FantasySelection[]
  userId: string
  freeHitActive?: boolean
  /** lockStart has crossed — used for transfer-log gating only */
  deadlinePassed?: boolean
  /** currently inside the [lockStart, lockEnd] window — blocks editing */
  isLocked?: boolean
  /** ISO string of lockEnd — when the team unlocks */
  lockUntil?: string
  creditTrends?: Record<string, 'up' | 'down' | 'neutral'>
  baseSquadIds?: string[]
  confirmedTransfers?: number
  transferLimit?: number
  megaTransferActive?: boolean
  selectionPercentages?: Record<string, number>
  playingXI?: string[]
  /** True when every match on this matchday has its playing XI set by admin */
  allXIConfirmed?: boolean
}

// ── Role colour system ────────────────────────────────────────────────────────
// WK = purple, BAT = blue, AR = green, BOWL = red

/** Solid active colour for the selected tab button */
const ROLE_TAB_ACTIVE: Record<string, string> = {
  wicket_keeper: 'bg-[#7C3AED] text-white border-[#7C3AED]',
  batsman:       'bg-[#2563EB] text-white border-[#2563EB]',
  all_rounder:   'bg-[#16A34A] text-white border-[#16A34A]',
  bowler:        'bg-[#DC2626] text-white border-[#DC2626]',
}

/** Light tint for inactive tab buttons */
const ROLE_TAB_INACTIVE: Record<string, string> = {
  wicket_keeper: 'bg-[#EDE9FE] text-[#7C3AED] border-[#DDD6FE] hover:border-[#7C3AED]',
  batsman:       'bg-[#DBEAFE] text-[#2563EB] border-[#BFDBFE] hover:border-[#2563EB]',
  all_rounder:   'bg-[#DCFCE7] text-[#16A34A] border-[#BBF7D0] hover:border-[#16A34A]',
  bowler:        'bg-[#FEE2E2] text-[#DC2626] border-[#FECACA] hover:border-[#DC2626]',
}

/** Badge pill colour for player cards */
const ROLE_COLORS: Record<string, string> = {
  wicket_keeper: 'bg-[#EDE9FE] text-[#7C3AED]',
  batsman:       'bg-[#DBEAFE] text-[#2563EB]',
  all_rounder:   'bg-[#DCFCE7] text-[#16A34A]',
  bowler:        'bg-[#FEE2E2] text-[#DC2626]',
}

/** Progress card accent — border when active tab, fill bar */
const ROLE_PROGRESS: Record<string, { border: string; bar: string; text: string; activeBg: string }> = {
  wicket_keeper: { border: 'border-[#7C3AED]', bar: 'bg-[#7C3AED]', text: 'text-[#7C3AED]', activeBg: 'bg-[#EDE9FE]' },
  batsman:       { border: 'border-[#2563EB]', bar: 'bg-[#2563EB]', text: 'text-[#2563EB]', activeBg: 'bg-[#DBEAFE]' },
  all_rounder:   { border: 'border-[#16A34A]', bar: 'bg-[#16A34A]', text: 'text-[#16A34A]', activeBg: 'bg-[#DCFCE7]' },
  bowler:        { border: 'border-[#DC2626]', bar: 'bg-[#DC2626]', text: 'text-[#DC2626]', activeBg: 'bg-[#FEE2E2]' },
}

const ROLE_CONSTRAINTS: Record<string, { min: number; max: number; label: string }> = {
  wicket_keeper: { min: 1, max: 4, label: 'Wicket Keepers' },
  batsman:       { min: 3, max: 6, label: 'Batters' },
  all_rounder:   { min: 1, max: 4, label: 'All-Rounders' },
  bowler:        { min: 3, max: 6, label: 'Bowlers' },
}

const SHORT_LABELS: Record<string, string> = {
  wicket_keeper: 'WK',
  batsman: 'BAT',
  all_rounder: 'AR',
  bowler: 'BOWL',
}

const ROLE_ORDER = ['wicket_keeper', 'batsman', 'all_rounder', 'bowler']

export default function TeamBuilder({ season, nextMatch, players, myTeam, existingSelections, userId, freeHitActive = false, deadlinePassed = false, isLocked = false, lockUntil, creditTrends = {}, baseSquadIds = [], confirmedTransfers = 0, transferLimit = 300, megaTransferActive = false, selectionPercentages = {}, playingXI = [], allXIConfirmed = false }: TeamBuilderProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const SQUAD_SIZE   = 15 // 11 starters + 4 subs
  const STARTER_SIZE = 11

  const [teamName, setTeamName] = useState(myTeam?.team_name ?? '')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(existingSelections.map((s) => s.player_id))
  )
  // subOrder: array of sub player IDs in priority order (index 0 = sub 1)
  const [subOrder, setSubOrder] = useState<string[]>(() =>
    existingSelections
      .filter((s) => s.is_substitute && s.sub_priority != null)
      .sort((a, b) => (a.sub_priority ?? 99) - (b.sub_priority ?? 99))
      .map((s) => s.player_id)
  )
  const [captainId, setCaptainId] = useState<string | null>(
    existingSelections.find((s) => s.is_captain)?.player_id ?? null
  )
  const [vcId, setVcId] = useState<string | null>(
    existingSelections.find((s) => s.is_vice_captain)?.player_id ?? null
  )
  const [roleFilter, setRoleFilter] = useState<string>('wicket_keeper')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'price' | 'ownership'>('price')
  const [showOnlyPlaying, setShowOnlyPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Memoised so the Set reference is stable across re-renders that don't
  // change playingXI, which in turn lets filteredPlayers memo stay stable too.
  const playingSet = useMemo(() => new Set(playingXI), [playingXI])
  const hasPlayingXI = playingXI.length > 0

  const maxPlayers = SQUAD_SIZE  // 15 total
  const budget = season.team_budget

  const subIds = new Set(subOrder)
  const starterIds = new Set([...selectedIds].filter((id) => !subIds.has(id)))
  const selectedPlayers = players.filter((p) => selectedIds.has(p.id))
  const starterPlayers  = players.filter((p) => starterIds.has(p.id))
  const substitutePlayers = subOrder.map((id) => players.find((p) => p.id === id)).filter(Boolean) as typeof players

  // Transfer tracking
  const baseSet = new Set(baseSquadIds)
  const pendingChanges = Array.from(selectedIds).filter((id) => !baseSet.has(id)).length
  const transfersRemaining = transferLimit - confirmedTransfers
  // Warning only applies pre-deadline (after deadline those pending changes are already confirmed/irrelevant)
  const wouldExceedLimit = !deadlinePassed && !megaTransferActive && pendingChanges > transfersRemaining && baseSquadIds.length > 0
  const budgetUsed = selectedPlayers.reduce((sum, p) => sum + p.price, 0)
  const budgetRemaining = budget - budgetUsed
  const budgetPct = Math.min(100, (budgetUsed / budget) * 100)
  const budgetLow = budgetRemaining < budget * 0.15

  // Role counts based on STARTERS only (formation applies to starters)
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of ROLE_ORDER) counts[r] = starterPlayers.filter((p) => p.role === r).length
    return counts
  }, [starterPlayers])

  const roleComplete = (r: string) => {
    const { min, max } = ROLE_CONSTRAINTS[r]
    const c = roleCounts[r]
    return c >= min && c <= max
  }
  const roleAtMax = (r: string) => roleCounts[r] >= ROLE_CONSTRAINTS[r].max

  // Auto-advance to next tab when starter formation for current role is full
  useEffect(() => {
    if (!roleAtMax(roleFilter)) return
    const idx = ROLE_ORDER.indexOf(roleFilter)
    const next = ROLE_ORDER.find((r, i) => i > idx && !roleAtMax(r))
    if (next) setRoleFilter(next)
  }, [roleCounts]) // eslint-disable-line react-hooks/exhaustive-deps

  const allStartersSelected = starterIds.size === STARTER_SIZE
  const allSelected  = selectedIds.size === SQUAD_SIZE
  const needsCaptain = allStartersSelected && !captainId
  const needsVC      = allStartersSelected && captainId && !vcId

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...players]           // shallow-copy so sort never mutates the prop
      .filter((p) => {
        if (p.role !== roleFilter) return false
        if (q && !p.name.toLowerCase().includes(q)) return false
        if (showOnlyPlaying && hasPlayingXI && !playingSet.has(p.id)) return false
        return true
      })
      .sort((a, b) => {
        // ── Tier 1: playing status — always the primary key ─────────────────
        // Assign 0 (playing) or 1 (not playing / no XI announced).
        // When hasPlayingXI is false both get 0 and this tier is a no-op,
        // falling straight through to Tier 2 — no conditional guard needed.
        const aPlaying = hasPlayingXI && playingSet.has(a.id) ? 0 : 1
        const bPlaying = hasPlayingXI && playingSet.has(b.id) ? 0 : 1
        if (aPlaying !== bPlaying) return aPlaying - bPlaying

        // ── Tier 2: user-chosen sort ─────────────────────────────────────────
        if (sortBy === 'ownership') {
          return (selectionPercentages[b.id] ?? 0) - (selectionPercentages[a.id] ?? 0)
        }
        return b.price - a.price
      })
  }, [players, roleFilter, search, showOnlyPlaying, hasPlayingXI, playingSet, sortBy, selectionPercentages])

  function togglePlayer(player: Player) {
    if (isLocked) return
    const newSet = new Set(selectedIds)
    if (newSet.has(player.id)) {
      newSet.delete(player.id)
      if (captainId === player.id) setCaptainId(null)
      if (vcId === player.id) setVcId(null)
      // If it was a sub, remove from subOrder too
      if (subIds.has(player.id)) {
        setSubOrder((prev) => prev.filter((id) => id !== player.id))
      }
    } else {
      if (newSet.size >= SQUAD_SIZE) return
      if (!freeHitActive && budgetUsed + player.price > budget) return
      newSet.add(player.id)
      // Route to starters first; once 11 starters filled, add as sub
      if (starterIds.size >= STARTER_SIZE) {
        // Adding as substitute — no role constraint on subs
        if (subOrder.length < 4) {
          setSubOrder((prev) => [...prev, player.id])
        }
      } else {
        // Adding as starter — enforce role maximum for starters
        const roleCount = starterPlayers.filter((p) => p.role === player.role).length
        if (roleCount >= ROLE_CONSTRAINTS[player.role].max) return
      }
    }
    setSelectedIds(newSet)
  }

  function moveSubUp(playerId: string) {
    setSubOrder((prev) => {
      const idx = prev.indexOf(playerId)
      if (idx <= 0) return prev
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  function moveSubDown(playerId: string) {
    setSubOrder((prev) => {
      const idx = prev.indexOf(playerId)
      if (idx < 0 || idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  function setCaptain(playerId: string) {
    if (!selectedIds.has(playerId)) return
    if (captainId === playerId) { setCaptainId(null); return }
    if (vcId === playerId) setVcId(null)
    setCaptainId(playerId)
  }

  function setVC(playerId: string) {
    if (!selectedIds.has(playerId)) return
    if (vcId === playerId) { setVcId(null); return }
    if (captainId === playerId) setCaptainId(null)
    setVcId(playerId)
  }

  async function handleSave() {
    setError(null)
    if (isLocked) { setError('Match is in progress. Team selection is locked until the match starts.'); return }
    if (!teamName.trim()) { setError('Please enter a team name.'); return }
    if (starterIds.size !== STARTER_SIZE) { setError(`Select exactly ${STARTER_SIZE} starting players (currently ${starterIds.size}).`); return }
    if (subOrder.length < 4) { setError(`Add ${4 - subOrder.length} more substitute${4 - subOrder.length !== 1 ? 's' : ''} (need 4 total).`); return }
    // Validate role constraints on STARTERS only
    const roleViolations: string[] = []
    for (const [role, { min, max, label }] of Object.entries(ROLE_CONSTRAINTS)) {
      const count = Array.from(starterIds).filter((id) => players.find((p) => p.id === id)?.role === role).length
      if (count < min) roleViolations.push(`${label}: need at least ${min} (you have ${count})`)
      if (count > max) roleViolations.push(`${label}: maximum is ${max} (you have ${count})`)
    }
    if (roleViolations.length > 0) {
      setError('Squad requirements not met:\n' + roleViolations.map((v) => `• ${v}`).join('\n'))
      return
    }
    if (!captainId) { setError('Select a captain.'); return }
    if (!vcId) { setError('Select a vice-captain.'); return }

    const supabase = createClient()

    // Create team if doesn't exist
    let teamId = myTeam?.id
    if (!teamId) {
      const { data: newTeam, error: teamErr } = await supabase
        .from('fantasy_teams')
        .insert({ user_id: userId, season_id: season.id, team_name: teamName.trim() })
        .select()
        .single()
      if (teamErr) { setError(teamErr.message); return }
      teamId = newTeam.id
    } else if (teamName.trim() !== myTeam?.team_name) {
      await supabase.from('fantasy_teams').update({ team_name: teamName.trim() }).eq('id', teamId)
    }

    // Delete existing selections for this match
    await supabase.from('fantasy_selections').delete().eq('fantasy_team_id', teamId).eq('match_id', nextMatch.id)

    // Insert new selections (starters + subs)
    const insertData = Array.from(selectedIds).map((pid) => {
      const isSub = subIds.has(pid)
      const subIdx = subOrder.indexOf(pid)
      return {
        fantasy_team_id: teamId!,
        match_id:        nextMatch.id,
        player_id:       pid,
        is_captain:      pid === captainId,
        is_vice_captain: pid === vcId,
        is_substitute:   isSub,
        sub_priority:    isSub && subIdx >= 0 ? subIdx + 1 : null,
      }
    })

    const { error: selErr } = await supabase.from('fantasy_selections').insert(insertData)
    if (selErr) { setError(selErr.message); return }

    // Compute transfer diff vs base squad and upsert transfer log.
    // Only write the log if lockStart hasn't passed yet — after lockStart, this gameweek's
    // transfer count is already confirmed and we don't overwrite it. After lockEnd the user is
    // freely prepping for the next gameweek (no new log entry for the old match needed).
    if (!deadlinePassed && (myTeam || teamId)) {
      const baseSet = new Set(baseSquadIds)
      const currentSet = selectedIds
      const playersIn  = Array.from(currentSet).filter((id) => !baseSet.has(id))
      const playersOut = Array.from(baseSet).filter((id) => !currentSet.has(id))
      const pendingCount = playersIn.length

      const { error: logErr } = await supabase
        .from('transfer_logs')
        .upsert(
          {
            fantasy_team_id: teamId,
            match_id: nextMatch.id,
            players_in: playersIn,
            players_out: playersOut,
            transfers_used: pendingCount,
            is_mega_transfer: megaTransferActive,
          },
          { onConflict: 'fantasy_team_id,match_id' }
        )
      if (logErr) console.warn('Transfer log upsert failed:', logErr.message)
    }

    setSuccess(true)
    startTransition(() => { router.refresh() })
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#C9A84C]">My Team</h1>
        <p className="text-muted-foreground mt-1">
          Picking for Match {nextMatch.match_number} — {nextMatch.opponent_team} •{' '}
          {new Date(nextMatch.match_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>

      {isLocked && (
        <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
          <span className="text-xl">🏏</span>
          <div>
            <p className="text-sm font-bold text-orange-800">
              Match in progress — team locked until {lockUntil ? new Date(lockUntil).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'matches finish'}
            </p>
            <p className="text-xs text-orange-700">Your saved squad is playing. You can make changes once the lock lifts.</p>
          </div>
        </div>
      )}

      {freeHitActive && !isLocked && (
        <div className="flex items-center gap-2 bg-[#fef9ee] border border-[#C9A84C] rounded-lg px-4 py-3">
          <span className="text-xl">🆓</span>
          <div>
            <p className="text-sm font-semibold text-[#C9A84C]">Free Hit Active — No Budget Limit!</p>
            <p className="text-xs text-muted-foreground">Pick any players this match. Your squad reverts next match.</p>
          </div>
        </div>
      )}

      {/* Transfer status banner — shown before deadline and after unlock, hidden during lock */}
      {!isLocked && myTeam && (
        <div className={`flex items-start justify-between gap-3 rounded-lg px-4 py-3 border ${
          wouldExceedLimit
            ? 'bg-red-50 border-red-200'
            : transfersRemaining <= 10
            ? 'bg-orange-50 border-orange-200'
            : transfersRemaining <= 50
            ? 'bg-yellow-50 border-yellow-100'
            : 'bg-[#f0f0f0] border-[#C9A84C]/20'
        }`}>
          <div>
            <p className={`text-sm font-semibold ${wouldExceedLimit ? 'text-red-700' : 'text-[#C9A84C]'}`}>
              {deadlinePassed
                ? '📋 Next gameweek open — changes will use transfers when deadline passes'
                : '🔄 Changes are free until deadline — transfers only count once deadline passes'
              }
            </p>
            <p className={`text-xs mt-0.5 ${wouldExceedLimit ? 'text-red-600' : 'text-muted-foreground'}`}>
              {deadlinePassed
                ? 'This gameweek\'s transfers are confirmed. Every swap from now counts as 1 transfer at the next deadline.'
                : megaTransferActive
                ? 'Mega Transfer active — unlimited free transfers this match'
                : wouldExceedLimit
                ? `Warning: ${pendingChanges} pending change${pendingChanges !== 1 ? 's' : ''} would exceed your ${transfersRemaining} remaining transfer${transfersRemaining !== 1 ? 's' : ''}`
                : baseSquadIds.length === 0
                ? 'First match — no transfers counted'
                : pendingChanges > 0
                ? `${pendingChanges} pending change${pendingChanges !== 1 ? 's' : ''} (will use ${pendingChanges} transfer${pendingChanges !== 1 ? 's' : ''} at deadline)`
                : 'No changes from previous squad'
              }
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-lg font-bold ${transfersRemaining <= 10 ? 'text-[#b5211e]' : 'text-[#C9A84C]'}`}>
              {transfersRemaining}
            </p>
            <p className="text-xs text-muted-foreground whitespace-nowrap">/ {transferLimit} left</p>
          </div>
        </div>
      )}

      {/* ── Captain / VC prompt ──────────────────────────────────────────── */}
      {(needsCaptain || needsVC) && (
        <div className="rounded-2xl bg-gradient-to-r from-[#C9A84C]/15 to-[#f5d97a]/10 border border-[#C9A84C]/40 px-5 py-4 flex items-start gap-3">
          <span className="text-2xl shrink-0">👑</span>
          <div>
            <p className="text-sm font-black text-[#C9A84C]">
              {needsCaptain ? 'Now pick your Captain!' : 'Now pick your Vice-Captain!'}
            </p>
            <p className="text-xs text-[#0b0b0b]/60 mt-0.5">
              {needsCaptain
                ? 'Your Captain earns 2× points. Tap C on any player in your squad below (on the pitch view).'
                : 'Your Vice-Captain earns 1.5× points. Tap VC on any remaining player.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Team name + budget ────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="teamName">Team Name</Label>
              <Input
                id="teamName"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Thunder Strikers"
                maxLength={40}
              />
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm text-muted-foreground">Starters / Subs</p>
              <p className={`text-xl font-bold tabular-nums ${allStartersSelected ? 'text-[#C9A84C]' : 'text-[#aaaaaa]'}`}>
                {starterIds.size}<span className="text-sm font-normal text-muted-foreground">/11</span>
                <span className="ml-1 text-sm font-normal text-gray-400">+{subOrder.length}/4</span>
              </p>
            </div>
          </div>

          {/* Budget bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-[#0b0b0b]/60">Budget used</span>
              <span className={`font-black tabular-nums ${budgetRemaining < 0 ? 'text-[#b5211e]' : budgetLow ? 'text-orange-500' : 'text-[#C9A84C]'}`}>
                {budgetRemaining < 0 ? '⚠ ' : ''}{budgetRemaining.toFixed(1)} cr remaining
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  budgetRemaining < 0 ? 'bg-[#b5211e]' : budgetLow ? 'bg-orange-400' : 'bg-[#C9A84C]'
                }`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">{budgetUsed.toFixed(1)} / {budget} cr used</p>
          </div>
        </CardContent>
      </Card>

      {/* ── Position progress guidance ────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ROLE_ORDER.map((r) => {
          const { min, max, label } = ROLE_CONSTRAINTS[r]
          const count  = roleCounts[r]
          const done   = roleComplete(r)
          const over   = count > max
          const under  = count < min
          const pct    = Math.min(100, (count / max) * 100)
          return (
            <div
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`cursor-pointer rounded-2xl p-3 border-2 transition-all select-none ${
                roleFilter === r
                  ? `${ROLE_PROGRESS[r].border} ${ROLE_PROGRESS[r].activeBg}`
                  : over
                  ? 'border-red-300 bg-red-50'
                  : `border-gray-200 bg-white hover:${ROLE_PROGRESS[r].border}`
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-bold uppercase tracking-wide ${roleFilter === r ? ROLE_PROGRESS[r].text : 'text-gray-600'}`}>{SHORT_LABELS[r]}</span>
                {done && <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${ROLE_PROGRESS[r].activeBg} ${ROLE_PROGRESS[r].text}`}>✓ Done</span>}
                {over && <span className="text-[10px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">Over</span>}
              </div>
              <p className={`text-lg font-black tabular-nums leading-none ${over ? 'text-red-600' : count > 0 ? ROLE_PROGRESS[r].text : 'text-gray-700'}`}>
                {count}<span className="text-xs font-normal text-gray-400">/{min}–{max}</span>
              </p>
              <div className="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${over ? 'bg-red-400' : ROLE_PROGRESS[r].bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5 truncate">{label}</p>
            </div>
          )
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Player pool */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Player Pool</CardTitle>
                <span className="text-xs text-muted-foreground font-medium">
                  Showing: <span className="font-bold text-[#C9A84C]">{ROLE_CONSTRAINTS[roleFilter].label}</span>
                </span>
              </div>
              {/* Compact role tabs */}
              <div className="flex gap-1.5 flex-wrap pt-1">
                {ROLE_ORDER.map((r) => {
                  const done     = roleComplete(r)
                  const over     = roleCounts[r] > ROLE_CONSTRAINTS[r].max
                  const isActive = roleFilter === r
                  return (
                    <button
                      key={r}
                      onClick={() => setRoleFilter(r)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                        isActive
                          ? `${ROLE_TAB_ACTIVE[r]} shadow-sm`
                          : over
                          ? 'bg-red-50 text-red-600 border-red-300'
                          : ROLE_TAB_INACTIVE[r]
                      }`}
                    >
                      {SHORT_LABELS[r]}
                      {done && !isActive && <span className="ml-1">✓</span>}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground pt-0.5">
                Pick {ROLE_CONSTRAINTS[roleFilter].min}–{ROLE_CONSTRAINTS[roleFilter].max} {ROLE_CONSTRAINTS[roleFilter].label}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                <div className="flex gap-1 items-center">
                  <span className="text-xs text-muted-foreground">Sort:</span>
                  {(['price', 'ownership'] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setSortBy(opt)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                        sortBy === opt ? 'bg-[#f0f0f0] text-[#0b0b0b]' : 'bg-[#eeeeee] text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {opt === 'price' ? 'Price' : 'Ownership %'}
                    </button>
                  ))}
                </div>
                {hasPlayingXI && (
                  <button
                    onClick={() => setShowOnlyPlaying((v) => !v)}
                    className={`flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium border transition-colors ${
                      showOnlyPlaying
                        ? 'bg-green-600 text-[#0b0b0b] border-green-600'
                        : 'bg-[#f0f0f0] border-green-400 text-green-700 hover:bg-green-50'
                    }`}
                  >
                    🟢 {showOnlyPlaying ? 'All Players' : 'Playing Only'}
                  </button>
                )}
              </div>
              <Input
                placeholder="Search players..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mt-2"
              />
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[520px] overflow-y-auto">
                {filteredPlayers.length === 0 && (
                  <div className="py-10 text-center text-sm text-gray-400">No players found</div>
                )}
                {filteredPlayers.map((player) => {
                  const isSelected   = selectedIds.has(player.id)
                  const isAffordable = freeHitActive || isSelected || budgetUsed + player.price <= budget
                  const isSub        = subIds.has(player.id)
                  // Full when: 11 starters filled AND 4 subs filled
                  const isFull       = !isSelected && selectedIds.size >= SQUAD_SIZE
                  // Role max only applies to starters; subs are free picks
                  const isRoleFull   = !isSelected && !isSub && starterIds.size < STARTER_SIZE && roleAtMax(player.role)
                  const disabled     = (!isAffordable || isFull || isRoleFull) && !isSelected
                  const isCap        = captainId === player.id
                  const isVCP        = vcId === player.id

                  return (
                    <div
                      key={player.id}
                      className={`px-4 py-3 transition-colors ${
                        isSelected
                          ? `bg-gray-50 border-l-4 ${ROLE_PROGRESS[player.role]?.border ?? 'border-l-gray-300'}`
                          : disabled
                          ? 'opacity-40 bg-white'
                          : 'bg-white hover:bg-gray-50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Player info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link
                              href={`/players/${player.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-sm font-bold hover:underline hover:text-[#C9A84C] truncate"
                            >
                              {player.name}
                            </Link>
                            {isCap  && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-yellow-400 text-black">C</span>}
                            {isVCP  && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-blue-400 text-black">VC</span>}
                            {isSub  && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-600">SUB {subOrder.indexOf(player.id) + 1}</span>}
                            {hasPlayingXI && (
                              playingSet.has(player.id) ? (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">🟢 Playing</span>
                              ) : allXIConfirmed ? (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-500 border border-red-200">Out</span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] text-gray-400 border border-gray-200">?</span>
                              )
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <Badge className={`text-[10px] py-0 px-1.5 ${ROLE_COLORS[player.role]} hover:${ROLE_COLORS[player.role]}`}>
                              {PLAYER_ROLE_LABELS[player.role]}
                            </Badge>
                            {selectionPercentages[player.id] != null && (
                              <span className="text-[10px] text-gray-400">
                                {selectionPercentages[player.id]}% owned
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Price + trend */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <span className={`text-sm font-black tabular-nums ${isSelected ? ROLE_PROGRESS[player.role]?.text ?? 'text-[#C9A84C]' : 'text-gray-700'}`}>
                            £{Number(player.price).toFixed(1)}
                          </span>
                          {creditTrends[player.id] === 'up'   && <span className="text-green-500 text-xs">↑</span>}
                          {creditTrends[player.id] === 'down' && <span className="text-red-400  text-xs">↓</span>}
                        </div>

                        {/* C/VC or Add/Remove */}
                        {isSelected ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => setCaptain(player.id)}
                              className={`w-7 h-7 rounded-full text-xs font-black border-2 transition-all ${
                                isCap
                                  ? 'bg-yellow-400 border-yellow-400 text-black'
                                  : 'border-gray-300 text-gray-400 hover:border-yellow-400 hover:text-yellow-600'
                              }`}
                            >C</button>
                            <button
                              onClick={() => setVC(player.id)}
                              className={`w-7 h-7 rounded-full text-xs font-black border-2 transition-all ${
                                isVCP
                                  ? 'bg-blue-400 border-blue-400 text-black'
                                  : 'border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-600'
                              }`}
                            >VC</button>
                            <button
                              onClick={() => togglePlayer(player)}
                              className="w-7 h-7 rounded-full bg-red-50 border border-red-200 text-red-500 text-sm font-black hover:bg-red-100 transition-colors flex items-center justify-center"
                              title="Remove"
                            >−</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => !disabled && togglePlayer(player)}
                            disabled={disabled}
                            className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-lg font-black transition-all ${
                              disabled
                                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                : 'bg-[#C9A84C] text-black hover:bg-[#a8892e] shadow-sm shadow-[#C9A84C]/30 active:scale-95'
                            }`}
                            title={disabled ? (isFull ? 'Squad full' : isRoleFull ? 'Position full' : 'Cannot afford') : 'Add player'}
                          >+</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pitch view sidebar */}
        <div className="space-y-3">
          {/* Player / budget counters */}
          <div className="flex items-center justify-between text-sm">
            <span className={`font-bold ${selectedIds.size === maxPlayers ? 'text-green-700' : 'text-gray-500'}`}>
              {selectedIds.size}/{maxPlayers} players
            </span>
            {!captainId && selectedIds.size > 0 && (
              <span className="text-[#C9A84C] text-xs font-semibold">⚠ Pick a captain</span>
            )}
            {captainId && !vcId && (
              <span className="text-[#C9A84C] text-xs font-semibold">⚠ Pick a vice captain</span>
            )}
            {captainId && vcId && (
              <span className="text-green-600 text-xs font-semibold">✓ C &amp; VC set</span>
            )}
          </div>

          <PitchView
            selectedPlayers={starterPlayers}
            captainId={captainId}
            vcId={vcId}
            playingXI={playingXI}
            creditTrends={creditTrends}
            selectionPercentages={selectionPercentages}
            onRemove={(id) => {
              const p = players.find((pl) => pl.id === id)
              if (p) togglePlayer(p)
            }}
            onSetCaptain={(id) => setCaptain(id)}
            onSetVC={(id) => setVC(id)}
            isLocked={isLocked}
            substitutePlayers={substitutePlayers}
            onSubPriorityUp={moveSubUp}
            onSubPriorityDown={moveSubDown}
            onRemoveSub={(id) => {
              const p = players.find((pl) => pl.id === id)
              if (p) togglePlayer(p)
            }}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md whitespace-pre-line">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-[#f0f0f0] border border-[#C9A84C]/20 text-[#C9A84C] text-sm px-3 py-2 rounded-md">
              Team saved successfully!
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={isPending || isLocked}
            className="w-full bg-[#f0f0f0] hover:bg-[#fafafa] text-[#0b0b0b] font-bold"
          >
            {isLocked ? '🏏 Match In Progress' : isPending ? 'Saving...' : myTeam ? 'Update Team' : 'Save Team'}
          </Button>
        </div>
      </div>
    </div>
  )
}
