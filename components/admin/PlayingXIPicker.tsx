'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Player } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PLAYER_ROLE_LABELS } from '@/lib/scoring'

const ROLE_ORDER = ['wicket_keeper', 'batsman', 'all_rounder', 'bowler'] as const
const ROLE_COLORS: Record<string, string> = {
  batsman:       'bg-blue-100 text-blue-700 border-blue-200',
  bowler:        'bg-[#fceaea] text-[#b5211e] border-red-200',
  all_rounder:   'bg-[#1c1c1c] text-[#C9A84C] border-[#C9A84C]/20',
  wicket_keeper: 'bg-[#fef9ee] text-[#a16207] border-yellow-200',
}
const ROLE_SHORT: Record<string, string> = {
  wicket_keeper: 'WK',
  batsman:       'BAT',
  all_rounder:   'AR',
  bowler:        'BOWL',
}

const MAX_XI = 11

interface Props {
  matchId: string
  matchLabel: string
  players: Player[]
  existingXI: string[]
}

export default function PlayingXIPicker({ matchId, matchLabel, players, existingXI }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set(existingXI))
  const [saving, setSaving]     = useState(false)
  const [clearing, setClearing] = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [activeRole, setActiveRole] = useState<string>('wicket_keeper')
  const [search, setSearch]         = useState('')

  const count = selected.size
  const full  = count === MAX_XI

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size >= MAX_XI) return prev   // block adding beyond 11
        next.add(id)
      }
      return next
    })
    setSaved(false)
    setError(null)
  }

  async function handleSave() {
    if (selected.size !== MAX_XI) { setError(`Select exactly 11 players (${selected.size} selected).`); return }
    setSaving(true)
    setError(null)
    const supabase = createClient()

    // Replace: delete existing then insert new
    const { error: delErr } = await supabase
      .from('match_playing_xi')
      .delete()
      .eq('match_id', matchId)
    if (delErr) { setError(delErr.message); setSaving(false); return }

    const rows = Array.from(selected).map((player_id) => ({ match_id: matchId, player_id }))
    const { error: insErr } = await supabase.from('match_playing_xi').insert(rows)
    if (insErr) { setError(insErr.message); setSaving(false); return }

    setSaving(false)
    setSaved(true)
    router.refresh()
  }

  async function handleClear() {
    setClearing(true)
    setError(null)
    const supabase = createClient()
    const { error: delErr } = await supabase
      .from('match_playing_xi')
      .delete()
      .eq('match_id', matchId)
    if (delErr) { setError(delErr.message); setClearing(false); return }
    setSelected(new Set())
    setClearing(false)
    setSaved(false)
    router.refresh()
  }

  const grouped = ROLE_ORDER.reduce<Record<string, Player[]>>((acc, role) => {
    acc[role] = players.filter((p) => p.role === role)
    return acc
  }, {})

  const allRolePlayers = grouped[activeRole] ?? []
  const rolePlayers    = search.trim()
    ? allRolePlayers.filter((p) =>
        p.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : allRolePlayers

  return (
    <div className="space-y-5">

      {/* Progress bar + counter */}
      <div className="rounded-xl bg-[#f0f0f0] p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <p className="text-[#0b0b0b]/60 text-xs font-semibold uppercase tracking-widest mb-2">Players selected</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-[#f5f5f5]/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${full ? 'bg-green-400' : 'bg-[#C9A84C]'}`}
                style={{ width: `${(count / MAX_XI) * 100}%` }}
              />
            </div>
            <span className={`text-2xl font-black tabular-nums ${full ? 'text-green-400' : 'text-[#C9A84C]'}`}>
              {count} <span className="text-[#0b0b0b]/40 text-lg font-normal">/ {MAX_XI}</span>
            </span>
          </div>
          {full && (
            <p className="text-green-400 text-xs font-semibold mt-1.5">✓ XI complete — ready to confirm</p>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          {selected.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={clearing || saving}
              className="border-white/30 text-[#0b0b0b] hover:bg-[#f5f5f5]/10 hover:text-[#0b0b0b] bg-transparent"
            >
              {clearing ? 'Clearing…' : 'Clear XI'}
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!full || saving || saved}
            className={`font-bold transition-all ${
              full && !saved
                ? 'bg-green-500 hover:bg-green-600 text-[#0b0b0b]'
                : saved
                ? 'bg-green-700 text-[#0b0b0b] cursor-default'
                : 'bg-[#f5f5f5]/20 text-[#0b0b0b]/40 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Confirm Playing XI'}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>
      )}

      {/* Role tabs */}
      <div className="flex gap-2 flex-wrap">
        {ROLE_ORDER.map((role) => {
          const roleSelected = grouped[role]?.filter((p) => selected.has(p.id)).length ?? 0
          const total        = grouped[role]?.length ?? 0
          const isActive     = activeRole === role
          return (
            <button
              key={role}
              onClick={() => { setActiveRole(role); setSearch('') }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                isActive
                  ? 'bg-[#f0f0f0] text-[#0b0b0b] border-[#C9A84C]'
                  : 'bg-[#f0f0f0] text-gray-600 border-[#d8d8d8] hover:border-[#C9A84C]/40 hover:bg-[#fef9ee]'
              }`}
            >
              {ROLE_SHORT[role]}
              <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                roleSelected > 0
                  ? isActive ? 'bg-[#C9A84C] text-[#0b0b0b]' : 'bg-[#f0f0f0] text-[#0b0b0b]'
                  : isActive ? 'bg-[#f5f5f5]/20 text-[#0b0b0b]/60' : 'bg-[#141414] text-gray-400'
              }`}>
                {roleSelected}/{total}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search input */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${ROLE_SHORT[activeRole]} players…`}
          className="w-full pl-9 pr-9 py-2.5 text-sm rounded-lg border border-[#d8d8d8] bg-[#f0f0f0] text-[#d4d4d4] placeholder:text-gray-400 focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/30 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Clear search"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Player grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {rolePlayers.map((player) => {
          const isSelected = selected.has(player.id)
          const wouldExceed = !isSelected && count >= MAX_XI

          return (
            <button
              key={player.id}
              onClick={() => !wouldExceed && toggle(player.id)}
              disabled={wouldExceed}
              className={`relative flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all duration-150 ${
                isSelected
                  ? 'bg-green-50 border-green-500 shadow-sm shadow-green-100'
                  : wouldExceed
                  ? 'bg-[#f8f8f8] border-[#1e1e1e] opacity-40 cursor-not-allowed'
                  : 'bg-[#f0f0f0] border-[#d8d8d8] hover:border-[#C9A84C]/40 hover:bg-[#fef9ee] cursor-pointer'
              }`}
            >
              {/* Tick / circle */}
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                isSelected ? 'bg-green-500 border-green-500' : 'border-gray-300 bg-[#f0f0f0]'
              }`}>
                {isSelected && (
                  <svg className="w-4 h-4 text-[#0b0b0b]" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className={`font-semibold text-sm truncate ${isSelected ? 'text-green-800' : 'text-[#d4d4d4]'}`}>
                  {player.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge className={`text-[10px] px-1.5 border ${ROLE_COLORS[player.role]} hover:${ROLE_COLORS[player.role]}`}>
                    {PLAYER_ROLE_LABELS[player.role]}
                  </Badge>
                  <span className="text-[10px] text-gray-400">{player.price} cr</span>
                </div>
              </div>

              {isSelected && (
                <span className="text-green-500 text-lg shrink-0">✓</span>
              )}
            </button>
          )
        })}

        {rolePlayers.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground py-8">
            {search.trim()
              ? <>No {ROLE_SHORT[activeRole]} players match &ldquo;{search}&rdquo;.</>
              : <>No {PLAYER_ROLE_LABELS[activeRole]} registered this season.</>}
          </p>
        )}
      </div>

      {/* Bottom save bar (sticky on scroll for long lists) */}
      <div className="sticky bottom-4 flex justify-end">
        <div className={`flex items-center gap-3 rounded-xl px-5 py-3 shadow-xl border transition-all ${
          full ? 'bg-green-600 border-green-700' : 'bg-[#f0f0f0] border-[#e8e8e8]'
        }`}>
          <span className="text-[#0b0b0b] text-sm font-medium">
            {full ? '✓ XI complete' : `${MAX_XI - count} more to pick`}
          </span>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!full || saving || saved}
            className={`font-bold ${
              full && !saved
                ? 'bg-[#f0f0f0] text-green-700 hover:bg-green-50'
                : saved
                ? 'bg-[#f5f5f5]/80 text-green-700 cursor-default'
                : 'bg-[#f5f5f5]/20 text-[#0b0b0b]/50 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Confirm XI'}
          </Button>
        </div>
      </div>
    </div>
  )
}
