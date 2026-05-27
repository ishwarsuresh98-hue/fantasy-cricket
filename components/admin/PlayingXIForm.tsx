'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Player } from '@/types'
import { Badge } from '@/components/ui/badge'
import { PLAYER_ROLE_LABELS } from '@/lib/scoring'

const ROLE_ORDER = ['wicket_keeper', 'batsman', 'all_rounder', 'bowler']
const ROLE_COLORS: Record<string, string> = {
  batsman: 'bg-blue-100 text-blue-700',
  bowler: 'bg-[#fceaea] text-[#b5211e]',
  all_rounder: 'bg-[#1c1c1c] text-[#C9A84C]',
  wicket_keeper: 'bg-[#fef9ee] text-[#C9A84C]',
}

interface Props {
  matchId: string
  players: Player[]
  existingXI: string[]   // player IDs already confirmed as playing
}

export default function PlayingXIForm({ matchId, players, existingXI }: Props) {
  const router = useRouter()
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set(existingXI))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function togglePlayer(playerId: string) {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const next = new Set(confirmed)

    if (next.has(playerId)) {
      // Remove
      const { error: delErr } = await supabase
        .from('match_playing_xi')
        .delete()
        .eq('match_id', matchId)
        .eq('player_id', playerId)
      if (delErr) { setError(delErr.message); setSaving(false); return }
      next.delete(playerId)
    } else {
      // Add
      const { error: insErr } = await supabase
        .from('match_playing_xi')
        .insert({ match_id: matchId, player_id: playerId })
      if (insErr) { setError(insErr.message); setSaving(false); return }
      next.add(playerId)
    }

    setConfirmed(next)
    setSaving(false)
    router.refresh()
  }

  async function clearAll() {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: delErr } = await supabase
      .from('match_playing_xi')
      .delete()
      .eq('match_id', matchId)
    if (delErr) { setError(delErr.message); setSaving(false); return }
    setConfirmed(new Set())
    setSaving(false)
    router.refresh()
  }

  const grouped = ROLE_ORDER.reduce<Record<string, Player[]>>((acc, role) => {
    acc[role] = players.filter((p) => p.role === role)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Click a player to toggle them as <span className="font-semibold text-green-700">Playing</span> or{' '}
            <span className="font-semibold text-gray-500">Unconfirmed</span>. Members see this in real-time on the team selection page.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-muted-foreground">{confirmed.size} confirmed</span>
          {confirmed.size > 0 && (
            <button
              onClick={clearAll}
              disabled={saving}
              className="text-xs text-red-600 hover:underline disabled:opacity-50"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      <div className="space-y-4">
        {ROLE_ORDER.map((role) => {
          const rolePlayers = grouped[role]
          if (!rolePlayers || rolePlayers.length === 0) return null
          return (
            <div key={role}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {PLAYER_ROLE_LABELS[role]}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {rolePlayers.map((player) => {
                  const isPlaying = confirmed.has(player.id)
                  return (
                    <button
                      key={player.id}
                      onClick={() => togglePlayer(player.id)}
                      disabled={saving}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all disabled:opacity-60 ${
                        isPlaying
                          ? 'bg-green-50 border-green-400 ring-1 ring-green-300'
                          : 'bg-[#f0f0f0] border-[#d8d8d8] hover:border-gray-400 hover:bg-[#f8f8f8]'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isPlaying ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium truncate ${isPlaying ? 'text-green-800' : 'text-[#aaaaaa]'}`}>
                          {player.name}
                        </p>
                        <Badge className={`text-xs mt-0.5 ${ROLE_COLORS[role]} hover:${ROLE_COLORS[role]}`}>
                          {PLAYER_ROLE_LABELS[role]}
                        </Badge>
                      </div>
                      {isPlaying && (
                        <span className="text-green-600 text-xs font-bold shrink-0">✓</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
