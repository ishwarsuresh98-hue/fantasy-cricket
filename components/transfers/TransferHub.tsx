'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import PlayerCard from '@/components/players/PlayerCard'
import type { PlayerRole } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────

export type PlayerWithStats = {
  id:         string
  name:       string
  role:       PlayerRole
  price:      number
  seasonPts:  number
  recentPts:  (number | null)[]   // last ≤3 matches, null = DNP
  isPlaying:  boolean
}

type SquadEntry = {
  playerId:      string
  isCaptain:     boolean
  isViceCaptain: boolean
}

export interface TransferHubProps {
  myTeamId:           string
  teamName:           string
  nextMatchId:        string | null   // null → no upcoming match
  nextMatchLabel:     string | null   // e.g. "Match 3 vs Marlow"
  saveMatchId:        string | null   // match to save selections against (= nextMatchId)
  initialSquad:       SquadEntry[]
  allPlayers:         PlayerWithStats[]
  budget:             number
  confirmedTransfers: number
  transferLimit:      number
  baseSquadIds:       string[]        // squad locked at last deadline (for diff)
  megaTransferActive: boolean
}

// ── Role config ────────────────────────────────────────────────────────────────

const ROLE_ORDER: PlayerRole[] = ['wicket_keeper', 'batsman', 'all_rounder', 'bowler']
const ROLE_SHORT: Record<PlayerRole, string> = {
  wicket_keeper: 'WK', batsman: 'BAT', all_rounder: 'AR', bowler: 'BOWL',
}
const ROLE_CONSTRAINTS: Record<PlayerRole, { min: number; max: number }> = {
  wicket_keeper: { min: 1, max: 4 },
  batsman:       { min: 3, max: 6 },
  all_rounder:   { min: 1, max: 4 },
  bowler:        { min: 3, max: 6 },
}
const MAX_SQUAD = 11

function fmtPts(n: number) { return n % 1 === 0 ? n.toString() : n.toFixed(1) }

// ── Component ──────────────────────────────────────────────────────────────────

export default function TransferHub({
  myTeamId,
  teamName,
  nextMatchId,
  nextMatchLabel,
  saveMatchId,
  initialSquad,
  allPlayers,
  budget,
  confirmedTransfers,
  transferLimit,
  baseSquadIds,
  megaTransferActive,
}: TransferHubProps) {
  const router = useRouter()

  // ── Squad state ──────────────────────────────────────────────────────────
  const [squadIds, setSquadIds]     = useState<Set<string>>(() => new Set(initialSquad.map((e) => e.playerId)))
  const [captainId, setCaptainIdSt] = useState<string | null>(() => initialSquad.find((e) => e.isCaptain)?.playerId ?? null)
  const [vcId, setVcIdSt]           = useState<string | null>(() => initialSquad.find((e) => e.isViceCaptain)?.playerId ?? null)

  // ── Swap selection ───────────────────────────────────────────────────────
  const [outId, setOutId]       = useState<string | null>(null)   // player being swapped OUT (from squad)
  const [inId, setInId]         = useState<string | null>(null)   // player being swapped IN (from pool)

  // ── Available-panel filters ──────────────────────────────────────────────
  const [roleFilter, setRoleFilter] = useState<PlayerRole | 'all'>('all')
  const [sortBy, setSortBy]         = useState<'price' | 'points' | 'form'>('points')
  const [search, setSearch]         = useState('')

  // ── Save state ───────────────────────────────────────────────────────────
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // ── Derived ──────────────────────────────────────────────────────────────
  const playerMap      = useMemo(() => new Map(allPlayers.map((p) => [p.id, p])), [allPlayers])
  const squadPlayers   = useMemo(() => [...squadIds].map((id) => playerMap.get(id)).filter(Boolean) as PlayerWithStats[], [squadIds, playerMap])
  const budgetUsed     = useMemo(() => squadPlayers.reduce((s, p) => s + p.price, 0), [squadPlayers])
  const budgetLeft     = budget - budgetUsed

  const baseSet        = useMemo(() => new Set(baseSquadIds), [baseSquadIds])
  const pendingChanges = useMemo(() => [...squadIds].filter((id) => !baseSet.has(id)).length, [squadIds, baseSet])
  const transfersLeft  = transferLimit - confirmedTransfers

  // Impact of the pending swap (price delta)
  const outPlayer = outId ? playerMap.get(outId) : null
  const inPlayer  = inId  ? playerMap.get(inId)  : null
  const swapDelta = (inPlayer?.price ?? 0) - (outPlayer?.price ?? 0)
  const swapAffordable = budgetLeft - swapDelta >= -0.001   // tiny float tolerance

  // Captain/VC warning if they've been removed
  const captainMissing = captainId !== null && !squadIds.has(captainId)
  const vcMissing      = vcId !== null && !squadIds.has(vcId)

  // ── Filtered available players ────────────────────────────────────────────
  const availablePlayers = useMemo(() => {
    const q = search.trim().toLowerCase()

    // When swap is pending, only show same-role players to keep it Dream11-like
    const effectiveRole: PlayerRole | 'all' =
      outPlayer && roleFilter === 'all' ? outPlayer.role : roleFilter

    return allPlayers
      .filter((p) => {
        if (squadIds.has(p.id)) return false
        if (effectiveRole !== 'all' && p.role !== effectiveRole) return false
        if (q && !p.name.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'price')  return b.price - a.price
        if (sortBy === 'points') return b.seasonPts - a.seasonPts
        // form = average of recent points
        const avgA = a.recentPts.filter((v): v is number => v !== null).reduce((s, v) => s + v, 0) / Math.max(1, a.recentPts.filter((v) => v !== null).length)
        const avgB = b.recentPts.filter((v): v is number => v !== null).reduce((s, v) => s + v, 0) / Math.max(1, b.recentPts.filter((v) => v !== null).length)
        return avgB - avgA
      })
  }, [allPlayers, squadIds, roleFilter, search, sortBy, outPlayer])

  // ── Handlers ─────────────────────────────────────────────────────────────

  function selectOut(playerId: string) {
    if (outId === playerId) { setOutId(null); setInId(null); return }
    setOutId(playerId)
    setInId(null)
    // Auto-set role filter to match the outgoing player's role
    const p = playerMap.get(playerId)
    if (p) setRoleFilter(p.role)
  }

  function selectIn(playerId: string) {
    if (!outId) return   // must pick outgoing player first
    if (inId === playerId) { setInId(null); return }
    // Budget check
    const inc = playerMap.get(playerId)
    if (!inc) return
    const out = playerMap.get(outId)
    const newBudgetLeft = budgetLeft - inc.price + (out?.price ?? 0)
    if (!megaTransferActive && newBudgetLeft < -0.001) return   // unaffordable
    setInId(playerId)
  }

  function confirmSwap() {
    if (!outId || !inId) return

    const newSquad = new Set(squadIds)
    newSquad.delete(outId)
    newSquad.add(inId)
    setSquadIds(newSquad)

    // If captain/VC was swapped out, clear
    if (captainId === outId) setCaptainIdSt(null)
    if (vcId === outId)      setVcIdSt(null)

    setOutId(null)
    setInId(null)
    setSaved(false)
    setError(null)
  }

  function cancelSwap() { setOutId(null); setInId(null) }

  async function handleSave() {
    if (!saveMatchId) { setError('No upcoming match to save transfers for.'); return }
    if (squadIds.size !== MAX_SQUAD) { setError(`Squad must have ${MAX_SQUAD} players (currently ${squadIds.size}).`); return }
    if (captainMissing) { setError('Your captain was removed. Go to My Team to assign a new captain before saving.'); return }
    if (vcMissing)      { setError('Your vice captain was removed. Go to My Team to assign a new VC before saving.'); return }

    setSaving(true)
    setError(null)
    const supabase = createClient()

    // Delete existing selections for this match
    const { error: delErr } = await supabase
      .from('fantasy_selections')
      .delete()
      .eq('fantasy_team_id', myTeamId)
      .eq('match_id', saveMatchId)
    if (delErr) { setError(delErr.message); setSaving(false); return }

    // Insert new selections
    const insertData = [...squadIds].map((pid) => ({
      fantasy_team_id:  myTeamId,
      match_id:         saveMatchId,
      player_id:        pid,
      is_captain:       pid === captainId,
      is_vice_captain:  pid === vcId,
    }))
    const { error: insErr } = await supabase.from('fantasy_selections').insert(insertData)
    if (insErr) { setError(insErr.message); setSaving(false); return }

    // Upsert transfer log
    const playersIn  = [...squadIds].filter((id) => !baseSet.has(id))
    const playersOut = [...baseSet].filter((id) => !squadIds.has(id))
    const { error: logErr } = await supabase
      .from('transfer_logs')
      .upsert(
        {
          fantasy_team_id: myTeamId,
          match_id:        saveMatchId,
          players_in:      playersIn,
          players_out:     playersOut,
          transfers_used:  playersIn.length,
          is_mega_transfer: megaTransferActive,
        },
        { onConflict: 'fantasy_team_id,match_id' },
      )
    if (logErr) console.warn('Transfer log upsert failed:', logErr.message)

    setSaving(false)
    setSaved(true)
    router.refresh()
    setTimeout(() => setSaved(false), 3000)
  }

  // ── Squad sorted display ──────────────────────────────────────────────────
  const sortedSquad = useMemo(() =>
    [...squadPlayers].sort((a, b) => {
      const aRole = ROLE_ORDER.indexOf(a.role)
      const bRole = ROLE_ORDER.indexOf(b.role)
      return aRole - bRole || a.name.localeCompare(b.name)
    }),
  [squadPlayers])

  // ── Render ────────────────────────────────────────────────────────────────

  if (!saveMatchId) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center space-y-2">
        <span className="text-3xl">📅</span>
        <p className="text-sm font-semibold text-gray-700">No upcoming match to transfer for</p>
        <p className="text-xs text-gray-400">Transfer changes can be made once the next match is scheduled.</p>
      </div>
    )
  }

  const warnOverLimit = !megaTransferActive && pendingChanges > transfersLeft && baseSquadIds.length > 0

  return (
    <div className="space-y-4">

      {/* ── Match + transfer status banner ─────────────────────────────── */}
      <div className="rounded-2xl bg-[#262162] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/50">Making transfers for</p>
          <p className="text-white font-bold text-base">{nextMatchLabel ?? 'Next Match'}</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Transfers used pill */}
          <div className="text-center">
            <p className={cn(
              'text-2xl font-black tabular-nums leading-none',
              warnOverLimit ? 'text-[#ff6b6b]' : 'text-[#fbf927]',
            )}>
              {pendingChanges}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">
              pending
            </p>
          </div>
          <div className="w-px h-8 bg-white/20" />
          <div className="text-center">
            <p className="text-2xl font-black tabular-nums text-white/80 leading-none">{transfersLeft}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">remaining</p>
          </div>
        </div>
      </div>

      {/* Over-limit warning */}
      {warnOverLimit && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
          <span>⚠️</span>
          <span>
            {pendingChanges} pending change{pendingChanges !== 1 ? 's' : ''} will exceed your {transfersLeft} remaining transfer{transfersLeft !== 1 ? 's' : ''}.
            Extra transfers will cost penalty points.
          </span>
        </div>
      )}

      {/* Budget bar */}
      <div className="rounded-2xl bg-white border border-gray-200 px-5 py-3 flex items-center gap-4">
        <div className="flex-1">
          <div className="flex justify-between text-xs font-bold mb-1.5">
            <span className="text-gray-500">Budget used</span>
            <span className={budgetLeft < 0 ? 'text-red-600' : 'text-gray-700'}>
              {budgetUsed.toFixed(1)} / {budget} cr
              {outId && inId && (
                <span className={cn(
                  'ml-2 font-black',
                  swapDelta > 0 ? 'text-red-500' : swapDelta < 0 ? 'text-green-600' : 'text-gray-400',
                )}>
                  {swapDelta > 0 ? `−${swapDelta.toFixed(1)} cr` : swapDelta < 0 ? `+${Math.abs(swapDelta).toFixed(1)} cr` : ''}
                </span>
              )}
            </span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                budgetLeft < 0 ? 'bg-red-500' : budgetLeft < budget * 0.1 ? 'bg-orange-400' : 'bg-[#262162]',
              )}
              style={{ width: `${Math.min(100, (budgetUsed / budget) * 100)}%` }}
            />
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={cn('text-lg font-black tabular-nums', budgetLeft < 0 ? 'text-red-600' : 'text-[#262162]')}>
            {budgetLeft.toFixed(1)}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-gray-400">cr left</p>
        </div>
      </div>

      {/* ── Two-panel grid ────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* ── Left: Your Squad ──────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden flex flex-col">
          {/* Panel header */}
          <div className="bg-[#262162] px-4 py-3 flex items-center justify-between">
            <p className="text-white font-bold text-sm">Your Squad</p>
            <span className="text-[#fbf927] font-black text-sm tabular-nums">
              {squadPlayers.length}/{MAX_SQUAD}
            </span>
          </div>

          {outId && (
            <div className="px-4 py-2 bg-[#fefde8] border-b border-[#fbf927]/40 text-xs font-semibold text-[#262162]">
              🟡 {playerMap.get(outId)?.name} selected — pick a replacement →
            </div>
          )}

          {/* Captain/VC missing warning */}
          {(captainMissing || vcMissing) && (
            <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-xs font-semibold text-red-700">
              ⚠ {captainMissing && 'Captain removed'}
              {captainMissing && vcMissing && ' · '}
              {vcMissing && 'VC removed'}
              {' '}— assign new in My Team before saving
            </div>
          )}

          <div className="divide-y divide-gray-100 overflow-y-auto max-h-[520px]">
            {sortedSquad.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">No squad selected yet</p>
            ) : (
              sortedSquad.map((player) => {
                const isOut = outId === player.id
                const wasChanged = !baseSet.has(player.id)
                return (
                  <div
                    key={player.id}
                    onClick={() => selectOut(player.id)}
                    className={cn(
                      'cursor-pointer transition-all',
                      isOut
                        ? 'ring-2 ring-inset ring-[#fbf927] bg-[#fefde8]'
                        : 'hover:bg-gray-50',
                    )}
                  >
                    <div className="relative">
                      <PlayerCard
                        id={player.id}
                        name={player.name}
                        role={player.role}
                        price={player.price}
                        size="compact"
                        isCaptain={captainId === player.id}
                        isViceCaptain={vcId === player.id}
                        isPlaying={player.isPlaying}
                        recentPoints={player.recentPts}
                      />
                      {/* "New" pip for players added this session */}
                      {wasChanged && (
                        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-green-500" />
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Right: Available Players ───────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden flex flex-col">
          {/* Panel header */}
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
            <p className="text-gray-800 font-bold text-sm mb-2">
              Available Players
              {!outId && (
                <span className="ml-1.5 text-xs font-normal text-gray-400">
                  — select a squad player first to swap
                </span>
              )}
            </p>

            {/* Role tabs */}
            <div className="flex gap-1.5 flex-wrap mb-2">
              {(['all', ...ROLE_ORDER] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => setRoleFilter(role)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-bold border transition-all',
                    roleFilter === role
                      ? 'bg-[#262162] text-white border-[#262162]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-[#262162]/40',
                  )}
                >
                  {role === 'all' ? 'ALL' : ROLE_SHORT[role]}
                </button>
              ))}
              {/* Sort */}
              <div className="ml-auto flex gap-1">
                {(['points', 'price', 'form'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={cn(
                      'px-2 py-1 rounded text-[10px] font-bold border transition-all capitalize',
                      sortBy === s
                        ? 'bg-[#262162] text-white border-[#262162]'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400',
                    )}
                  >
                    {s === 'points' ? 'Pts' : s === 'price' ? 'Cr' : 'Form'}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
                xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search players…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#262162] focus:ring-1 focus:ring-[#262162]/20 transition-colors"
              />
            </div>
          </div>

          <div className="divide-y divide-gray-100 overflow-y-auto max-h-[460px]">
            {availablePlayers.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">
                No players available{search ? ` matching "${search}"` : ''}
              </p>
            ) : (
              availablePlayers.map((player) => {
                const isIn        = inId === player.id
                const roleCount   = [...squadIds].filter((id) => playerMap.get(id)?.role === player.role).length
                const wouldExceed = roleCount >= ROLE_CONSTRAINTS[player.role].max
                const tooExpensive = !megaTransferActive &&
                  outPlayer ? (budgetLeft + outPlayer.price - player.price < -0.001) : false
                const canAdd = !wouldExceed && !tooExpensive && !!outId

                return (
                  <div key={player.id} className="relative flex items-center gap-2 pr-3">
                    {/* Player card (grows) */}
                    <div
                      className={cn(
                        'flex-1 transition-all',
                        isIn ? 'ring-2 ring-inset ring-green-400 bg-green-50' : '',
                        !canAdd && outId ? 'opacity-50' : '',
                      )}
                    >
                      <PlayerCard
                        id={player.id}
                        name={player.name}
                        role={player.role}
                        price={player.price}
                        size="compact"
                        isPlaying={player.isPlaying}
                        recentPoints={player.recentPts}
                        gwPoints={player.seasonPts > 0 ? player.seasonPts : undefined}
                      />
                    </div>

                    {/* Add button */}
                    <button
                      onClick={() => canAdd && selectIn(player.id)}
                      disabled={!canAdd}
                      className={cn(
                        'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-black border-2 transition-all',
                        isIn
                          ? 'bg-green-500 border-green-500 text-white'
                          : canAdd
                          ? 'border-[#262162] text-[#262162] hover:bg-[#262162] hover:text-white'
                          : 'border-gray-200 text-gray-300 cursor-not-allowed',
                      )}
                      title={
                        !outId ? 'Select a squad player to swap out first'
                          : tooExpensive ? 'Not enough budget'
                          : wouldExceed ? `Max ${ROLE_CONSTRAINTS[player.role].max} ${ROLE_SHORT[player.role]}s allowed`
                          : isIn ? 'Selected'
                          : 'Add'
                      }
                    >
                      {isIn ? '✓' : '+'}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Swap confirmation bar ─────────────────────────────────────────── */}
      {outId && inId && (
        <div className={cn(
          'sticky bottom-4 z-30 rounded-2xl px-5 py-4 shadow-xl border flex flex-col sm:flex-row items-start sm:items-center gap-3',
          swapAffordable ? 'bg-[#262162] border-[#1a1748]' : 'bg-red-700 border-red-800',
        )}>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate">
              <span className="text-red-300 font-black">OUT</span>{' '}
              {outPlayer?.name}
              <span className="mx-2 text-white/40">→</span>
              <span className="text-green-300 font-black">IN</span>{' '}
              {inPlayer?.name}
            </p>
            <p className={cn('text-xs font-semibold mt-0.5', swapAffordable ? 'text-white/60' : 'text-red-300')}>
              Impact:{' '}
              <span className={cn('font-black', swapDelta > 0 ? 'text-red-400' : swapDelta < 0 ? 'text-green-400' : 'text-white')}>
                {swapDelta === 0 ? 'No credit change' : swapDelta > 0 ? `−${swapDelta.toFixed(1)} cr` : `+${Math.abs(swapDelta).toFixed(1)} cr`}
              </span>
              {!swapAffordable && <span className="ml-2 text-red-300 font-bold">· Over budget!</span>}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={cancelSwap}
              className="px-4 py-2 rounded-xl border border-white/30 text-white text-sm font-bold hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmSwap}
              disabled={!swapAffordable}
              className={cn(
                'px-5 py-2 rounded-xl font-black text-sm transition-all',
                swapAffordable
                  ? 'bg-[#fbf927] text-[#262162] hover:bg-yellow-300'
                  : 'bg-white/20 text-white/40 cursor-not-allowed',
              )}
            >
              Confirm Swap
            </button>
          </div>
        </div>
      )}

      {/* ── Save button (when swaps are pending) ──────────────────────────── */}
      {pendingChanges > 0 && !(outId && inId) && (
        <div className="rounded-2xl bg-white border border-gray-200 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="font-bold text-sm text-gray-800">
              {pendingChanges} change{pendingChanges !== 1 ? 's' : ''} pending
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {megaTransferActive
                ? 'Mega Transfer active — no cost this round'
                : warnOverLimit
                ? `⚠ ${pendingChanges - transfersLeft} extra change${pendingChanges - transfersLeft !== 1 ? 's' : ''} will incur a points penalty`
                : `Will use ${pendingChanges} transfer${pendingChanges !== 1 ? 's' : ''} at the deadline`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSquadIds(new Set(initialSquad.map((e) => e.playerId)))
                setCaptainIdSt(initialSquad.find((e) => e.isCaptain)?.playerId ?? null)
                setVcIdSt(initialSquad.find((e) => e.isViceCaptain)?.playerId ?? null)
                setOutId(null); setInId(null)
                setSaved(false); setError(null)
              }}
              className="px-4 py-2 rounded-xl border border-gray-300 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className={cn(
                'px-6 py-2 rounded-xl font-black text-sm transition-all',
                saved
                  ? 'bg-green-500 text-white cursor-default'
                  : 'bg-[#262162] text-white hover:bg-[#1a1748]',
              )}
            >
              {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Transfers'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium">
          {error}
        </div>
      )}
    </div>
  )
}
