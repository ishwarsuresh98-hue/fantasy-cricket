'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter }    from 'next/navigation'
import { cn }           from '@/lib/utils'
import ContestPaymentWrapper from '@/components/ContestPaymentWrapper'
import type { Player, ContestTeamRow, ContestTeamPlayer } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  contestId:      string
  fantasyTeamId:  string
  players:        Player[]
  budget:         number
  entryFee:       number
  walletBalance:  number
  clubSlug:       string
  existingTeam:   ContestTeamRow | null
}

type Stage = 'pick' | 'captain' | 'confirm' | 'paying' | 'stripe' | 'done'
type RoleFilter = 'all' | 'wicket_keeper' | 'batsman' | 'all_rounder' | 'bowler'

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { label: string; short: string; color: string; min: number; max: number }> = {
  wicket_keeper: { label: 'Wicket Keepers', short: 'WK',   color: 'bg-amber-100 text-amber-700',   min: 1, max: 4 },
  batsman:       { label: 'Batsmen',         short: 'BAT',  color: 'bg-blue-100 text-blue-700',     min: 3, max: 6 },
  all_rounder:   { label: 'All-Rounders',    short: 'AR',   color: 'bg-purple-100 text-purple-700', min: 1, max: 4 },
  bowler:        { label: 'Bowlers',          short: 'BOWL', color: 'bg-green-100 text-green-700',   min: 3, max: 6 },
}

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'all',           label: 'All'     },
  { value: 'wicket_keeper', label: 'WK'      },
  { value: 'batsman',       label: 'BAT'     },
  { value: 'all_rounder',   label: 'AR'      },
  { value: 'bowler',        label: 'BOWL'    },
]

function fmt(n: number) { return `£${n % 1 === 0 ? n : n.toFixed(2)}` }

// ── Main component ────────────────────────────────────────────────────────────

export default function GameweekTeamBuilder({
  contestId, fantasyTeamId, players, budget, entryFee, walletBalance: initialBalance, clubSlug, existingTeam,
}: Props) {
  const router = useRouter()

  // ── Initialise from existing team ──────────────────────────────────────────
  const initSelected = useMemo<Set<string>>(() => {
    if (!existingTeam) return new Set()
    return new Set((existingTeam.players ?? []).map((p) => p.player_id))
  }, [existingTeam])

  const initCaptain = existingTeam?.players?.find((p) => p.is_captain)?.player_id ?? null
  const initVc      = existingTeam?.players?.find((p) => p.is_vice_captain)?.player_id ?? null

  const [stage,     setStage]     = useState<Stage>('pick')
  const [selected,  setSelected]  = useState<Set<string>>(initSelected)
  const [captainId, setCaptainId] = useState<string | null>(initCaptain)
  const [vcId,      setVcId]      = useState<string | null>(initVc)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [search,    setSearch]    = useState('')
  const [balance,   setBalance]   = useState(initialBalance)
  const [error,     setError]     = useState<string | null>(null)
  const [isSaving,  setIsSaving]  = useState(false)

  const returnUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/clubs/${clubSlug}/contests/${contestId}?payment=confirmed`
    : `/clubs/${clubSlug}/contests/${contestId}?payment=confirmed`

  // ── Derived state ──────────────────────────────────────────────────────────
  const selectedPlayers = useMemo(
    () => players.filter((p) => selected.has(p.id)),
    [players, selected],
  )

  const spent = useMemo(
    () => selectedPlayers.reduce((s, p) => s + Number(p.price ?? 0), 0),
    [selectedPlayers],
  )

  const remaining = budget - spent

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of selectedPlayers) counts[p.role] = (counts[p.role] ?? 0) + 1
    return counts
  }, [selectedPlayers])

  const validationErrors = useMemo(() => {
    const errs: string[] = []
    if (selected.size !== 11) errs.push(`Pick ${11 - selected.size} more player${11 - selected.size !== 1 ? 's' : ''}`)
    if (remaining < 0) errs.push(`Over budget by ${Math.abs(remaining)}cr`)
    for (const [role, cfg] of Object.entries(ROLE_CONFIG)) {
      const count = roleCounts[role] ?? 0
      if (count < cfg.min) errs.push(`Need ${cfg.min - count} more ${cfg.label}`)
    }
    return errs
  }, [selected, remaining, roleCounts])

  const isTeamValid = validationErrors.length === 0

  // ── Filtered player list ───────────────────────────────────────────────────
  const filteredPlayers = useMemo(() => {
    let list = players
    if (roleFilter !== 'all') list = list.filter((p) => p.role === roleFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q))
    }
    return list
  }, [players, roleFilter, search])

  // ── Handlers ──────────────────────────────────────────────────────────────
  function togglePlayer(player: Player) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(player.id)) {
        next.delete(player.id)
        if (captainId === player.id) setCaptainId(null)
        if (vcId === player.id)      setVcId(null)
      } else {
        if (next.size >= 11) return prev  // max 11
        const newCost = spent + Number(player.price ?? 0)
        if (newCost > budget) return prev // over budget

        // Role constraints: check max
        const role = player.role
        const cfg  = ROLE_CONFIG[role]
        if (cfg && (roleCounts[role] ?? 0) >= cfg.max) return prev

        next.add(player.id)
      }
      return next
    })
  }

  function setCaptain(playerId: string) {
    if (vcId === playerId) setVcId(null)
    setCaptainId(playerId)
  }

  function setViceCaptain(playerId: string) {
    if (captainId === playerId) setCaptainId(null)
    setVcId(playerId)
  }

  const buildPayload = useCallback((): ContestTeamPlayer[] => {
    return selectedPlayers.map((p) => ({
      player_id:       p.id,
      is_captain:      p.id === captainId,
      is_vice_captain: p.id === vcId,
    }))
  }, [selectedPlayers, captainId, vcId])

  const submitTeam = useCallback(async (paymentMethod: 'wallet' | 'gateway') => {
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/contests/${contestId}/pick-team`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          fantasy_team_id: fantasyTeamId,
          players:         buildPayload(),
          payment_method:  paymentMethod,
        }),
      })
      const json = await res.json() as {
        ok?: boolean; joined?: boolean; updated_team?: boolean
        wallet_balance?: number; error?: string
        return_url?: string; contest_id?: string; entry_fee?: number
      }

      if (!res.ok) {
        if (res.status === 402) { setStage('stripe'); return }
        setError(json.error ?? 'Something went wrong')
        return
      }

      if (json.joined || json.updated_team) {
        if (json.wallet_balance != null) setBalance(json.wallet_balance)
        setStage('done')
        setTimeout(() => router.push(`/clubs/${clubSlug}/contests/${contestId}`), 1200)
      }
    } catch {
      setError('Network error — please retry')
    } finally {
      setIsSaving(false)
    }
  }, [contestId, fantasyTeamId, buildPayload, clubSlug, router])

  // ── Stage: done ────────────────────────────────────────────────────────────
  if (stage === 'done') {
    return (
      <div className="rounded-2xl bg-green-50 border border-green-200 px-6 py-12 text-center space-y-3">
        <div className="text-5xl">✅</div>
        <h2 className="text-lg font-black text-green-800">You&apos;re in!</h2>
        <p className="text-sm text-green-600">Your team has been saved. Redirecting…</p>
      </div>
    )
  }

  // ── Stage: stripe ──────────────────────────────────────────────────────────
  if (stage === 'stripe') {
    return (
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">Pay by Card</p>
          <p className="text-sm text-gray-500">Entry fee: <span className="font-black text-[#C9A84C]">{fmt(entryFee)}</span></p>
        </div>
        <div className="px-5 py-5">
          <ContestPaymentWrapper
            contestId={contestId}
            fantasyTeamId={fantasyTeamId}
            entryFee={entryFee}
            returnUrl={returnUrl}
            onCancel={() => setStage('confirm')}
          />
        </div>
      </div>
    )
  }

  // ── Stage: captain selection ───────────────────────────────────────────────
  if (stage === 'captain') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-[#fef9ee] border border-[#C9A84C]/30 px-4 py-3">
          <p className="text-sm font-black text-gray-800 mb-0.5">Choose Captain &amp; Vice-Captain</p>
          <p className="text-xs text-gray-500">Captain earns 2× points · Vice-captain earns 1.5× points</p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
        )}

        <div className="space-y-2">
          {selectedPlayers.map((p) => {
            const isCap = captainId === p.id
            const isVc  = vcId === p.id
            const cfg   = ROLE_CONFIG[p.role]
            return (
              <div key={p.id} className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 border-2 transition-all',
                isCap ? 'border-[#C9A84C] bg-[#fef9ee]' : isVc ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white',
              )}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-800 truncate">{p.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded', cfg?.color ?? '')}>{cfg?.short}</span>
                    <span className="text-xs text-gray-400">{p.price}cr</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setCaptain(p.id)}
                    className={cn(
                      'w-9 h-9 rounded-full text-xs font-black border-2 transition-all',
                      isCap ? 'bg-[#C9A84C] border-[#C9A84C] text-black' : 'border-gray-200 text-gray-500 hover:border-[#C9A84C]',
                    )}
                  >C</button>
                  <button
                    onClick={() => setViceCaptain(p.id)}
                    disabled={isCap}
                    className={cn(
                      'w-9 h-9 rounded-full text-xs font-black border-2 transition-all',
                      isVc ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-200 text-gray-500 hover:border-blue-400',
                      isCap ? 'opacity-30 cursor-not-allowed' : '',
                    )}
                  >VC</button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button onClick={() => setStage('pick')} className="py-3 rounded-xl border-2 border-gray-200 text-gray-600 text-sm font-black hover:border-gray-300 transition-colors">
            ← Back
          </button>
          <button
            onClick={() => {
              if (!captainId) { setError('Select a captain'); return }
              if (!vcId)      { setError('Select a vice-captain'); return }
              setError(null)
              setStage('confirm')
            }}
            className="py-3 rounded-xl bg-[#C9A84C] text-black text-sm font-black hover:bg-[#a8892e] transition-colors"
          >
            Continue →
          </button>
        </div>
      </div>
    )
  }

  // ── Stage: confirm + pay ───────────────────────────────────────────────────
  if (stage === 'confirm' || stage === 'paying') {
    const captain = selectedPlayers.find((p) => p.id === captainId)
    const vc      = selectedPlayers.find((p) => p.id === vcId)
    const canAfford = balance >= entryFee
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-gray-50 border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-black text-gray-800">Your Team ({selectedPlayers.length} players · {spent}cr used)</p>
          </div>
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {selectedPlayers.map((p) => {
              const isCap = p.id === captainId
              const isVc  = p.id === vcId
              const cfg   = ROLE_CONFIG[p.role]
              return (
                <div key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded w-10 text-center', cfg?.color ?? '')}>{cfg?.short}</span>
                  <p className="text-sm font-medium text-gray-800 flex-1 truncate">{p.name}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isCap && <span className="text-[10px] font-black bg-[#C9A84C] text-black px-1.5 py-0.5 rounded">C</span>}
                    {isVc  && <span className="text-[10px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded">VC</span>}
                    <span className="text-xs text-gray-400 tabular-nums">{p.price}cr</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {entryFee > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Entry fee</p>
              <p className="text-xl font-black text-[#C9A84C]">{fmt(entryFee)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Wallet balance</p>
              <p className={cn('text-xl font-black', canAfford ? 'text-green-600' : 'text-red-500')}>
                £{Number(balance).toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

        <div className="space-y-2.5">
          {(entryFee === 0 || canAfford) && (
            <button
              onClick={() => void submitTeam('wallet')}
              disabled={isSaving}
              className="w-full py-4 rounded-2xl bg-[#C9A84C] text-black font-black text-sm hover:bg-[#a8892e] disabled:opacity-60 transition-colors"
            >
              {isSaving ? 'Saving…' : entryFee === 0 ? '🎯 Enter Free' : `Pay from Wallet · £${Number(balance).toFixed(2)}`}
            </button>
          )}
          {entryFee > 0 && (
            <button
              onClick={() => setStage('stripe')}
              disabled={isSaving}
              className={cn(
                'w-full py-3.5 rounded-xl font-black text-sm transition-colors disabled:opacity-60',
                canAfford
                  ? 'border-2 border-gray-200 text-gray-600 hover:border-[#C9A84C]/40'
                  : 'bg-[#C9A84C] text-black hover:bg-[#a8892e]',
              )}
            >
              {canAfford ? 'Pay by Card instead' : `Pay by Card · ${fmt(entryFee)}`}
            </button>
          )}
          <button onClick={() => setStage('captain')} disabled={isSaving} className="w-full py-2.5 rounded-xl text-sm text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors">
            ← Back
          </button>
        </div>

        {captain && vc && (
          <p className="text-center text-xs text-gray-400">
            Captain: <strong className="text-gray-600">{captain.name}</strong> ·
            VC: <strong className="text-gray-600">{vc.name}</strong>
          </p>
        )}
      </div>
    )
  }

  // ── Stage: pick (default) ─────────────────────────────────────────────────
  const canProceed = isTeamValid

  return (
    <div className="space-y-4">
      {/* Budget + selection status bar */}
      <div className="sticky top-0 z-10 rounded-2xl bg-white border border-gray-200 shadow-sm px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Selected</p>
            <p className="text-xl font-black text-gray-900 tabular-nums">{selected.size}<span className="text-gray-400 text-base">/11</span></p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Remaining</p>
            <p className={cn('text-xl font-black tabular-nums', remaining < 0 ? 'text-red-500' : remaining < 5 ? 'text-orange-500' : 'text-green-600')}>
              {remaining}cr
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Spent</p>
            <p className="text-xl font-black text-gray-900 tabular-nums">{spent}cr</p>
          </div>
        </div>
        {/* Role counts */}
        <div className="flex gap-2">
          {Object.entries(ROLE_CONFIG).map(([role, cfg]) => {
            const count = roleCounts[role] ?? 0
            const ok    = count >= cfg.min
            return (
              <div key={role} className={cn('flex-1 text-center rounded-lg py-1', ok ? 'bg-green-50' : 'bg-gray-50')}>
                <p className={cn('text-[10px] font-black uppercase', ok ? 'text-green-700' : 'text-gray-400')}>{cfg.short}</p>
                <p className={cn('text-sm font-black tabular-nums', ok ? 'text-green-700' : 'text-gray-600')}>{count}</p>
                <p className="text-[8px] text-gray-400">min {cfg.min}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Validation errors */}
      {!canProceed && selected.size > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5">
          {validationErrors.map((e, i) => (
            <p key={i} className="text-xs text-amber-700 font-medium">• {e}</p>
          ))}
        </div>
      )}

      {/* Role + search filters */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {ROLE_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setRoleFilter(value)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all whitespace-nowrap',
                roleFilter === value
                  ? 'bg-gray-900 border-gray-900 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player…"
          className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:border-[#C9A84C] bg-white"
        />
      </div>

      {/* Player list */}
      <div className="space-y-2">
        {filteredPlayers.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">No players found.</p>
        )}
        {filteredPlayers.map((player) => {
          const isSelected = selected.has(player.id)
          const cfg        = ROLE_CONFIG[player.role]
          const wouldExceedBudget = !isSelected && (spent + Number(player.price ?? 0)) > budget
          const wouldExceedRole   = !isSelected && (roleCounts[player.role] ?? 0) >= (cfg?.max ?? 99)
          const disabled = !isSelected && (selected.size >= 11 || wouldExceedBudget || wouldExceedRole)

          return (
            <button
              key={player.id}
              onClick={() => togglePlayer(player)}
              disabled={disabled && !isSelected}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl px-4 py-3 border-2 text-left transition-all',
                isSelected
                  ? 'border-[#C9A84C] bg-[#fef9ee]'
                  : disabled
                  ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                  : 'border-gray-200 bg-white hover:border-[#C9A84C]/50 hover:bg-[#fef9ee]/30',
              )}
            >
              {/* Role badge */}
              <span className={cn('text-[10px] font-black px-2 py-1 rounded w-10 text-center flex-shrink-0', cfg?.color ?? '')}>
                {cfg?.short}
              </span>

              {/* Name */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-800 truncate">{player.name}</p>
              </div>

              {/* Price + select indicator */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-black text-gray-700 tabular-nums">{player.price}cr</span>
                <div className={cn(
                  'w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                  isSelected ? 'bg-[#C9A84C] border-[#C9A84C]' : 'border-gray-300',
                )}>
                  {isSelected && <span className="text-black text-xs font-black">✓</span>}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* CTA */}
      <div className="sticky bottom-0 bg-white pt-3 pb-2 border-t border-gray-100">
        <button
          onClick={() => {
            if (!isTeamValid) return
            setStage('captain')
          }}
          disabled={!canProceed}
          className={cn(
            'w-full py-4 rounded-2xl font-black text-sm transition-all',
            canProceed
              ? 'bg-[#C9A84C] text-black hover:bg-[#a8892e] shadow-sm hover:shadow-md'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed',
          )}
        >
          {canProceed
            ? `Next: Pick Captain & VC →`
            : `${11 - selected.size} more player${11 - selected.size !== 1 ? 's' : ''} needed`}
        </button>
      </div>
    </div>
  )
}
