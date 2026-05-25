'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import PlayerCard from '@/components/players/PlayerCard'
import type { Player, PlayerRole } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PitchViewProps {
  selectedPlayers: Player[]
  captainId:       string | null
  vcId:            string | null
  playingXI:       string[]
  creditTrends:    Record<string, 'up' | 'down' | 'neutral'>
  selectionPercentages: Record<string, number>
  onRemove:        (playerId: string) => void
  onSetCaptain:    (playerId: string) => void
  onSetVC:         (playerId: string) => void
  isLocked?:       boolean
}

// Pitch rows — top to bottom display order
const PITCH_ROWS: { role: PlayerRole; label: string }[] = [
  { role: 'bowler',        label: 'Bowlers' },
  { role: 'all_rounder',   label: 'All-Rounders' },
  { role: 'batsman',       label: 'Batsmen' },
  { role: 'wicket_keeper', label: 'Wicket-Keepers' },
]

// ── C/VC Modal ────────────────────────────────────────────────────────────────

interface CaptainModalProps {
  player:       Player
  isCaptain:    boolean
  isViceCaptain: boolean
  onSetCaptain: () => void
  onSetVC:      () => void
  onRemove:     () => void
  onClose:      () => void
  isLocked?:    boolean
}

function CaptainModal({
  player,
  isCaptain,
  isViceCaptain,
  onSetCaptain,
  onSetVC,
  onRemove,
  onClose,
  isLocked,
}: CaptainModalProps) {
  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xs bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#262162] px-5 py-4">
          <p className="text-white font-bold text-base truncate">{player.name}</p>
          <p className="text-white/60 text-xs">{player.price} cr</p>
        </div>

        <div className="p-4 space-y-2">
          {/* Captain */}
          <button
            onClick={() => { onSetCaptain(); onClose() }}
            disabled={isLocked}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 font-semibold text-sm transition-all',
              isCaptain
                ? 'bg-[#fbf927] border-[#fbf927] text-[#262162]'
                : 'border-gray-200 text-gray-700 hover:border-[#fbf927] hover:bg-[#fefde8]',
              isLocked && 'opacity-50 cursor-not-allowed',
            )}
          >
            <span className="w-8 h-8 rounded-full bg-[#fbf927] text-[#262162] font-black text-sm flex items-center justify-center flex-shrink-0">
              C
            </span>
            <span>{isCaptain ? '★ Captain (tap to unset)' : 'Make Captain (2× points)'}</span>
          </button>

          {/* Vice captain */}
          <button
            onClick={() => { onSetVC(); onClose() }}
            disabled={isLocked}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 font-semibold text-sm transition-all',
              isViceCaptain
                ? 'bg-gray-200 border-gray-300 text-gray-700'
                : 'border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50',
              isLocked && 'opacity-50 cursor-not-allowed',
            )}
          >
            <span className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 font-black text-sm flex items-center justify-center flex-shrink-0">
              V
            </span>
            <span>{isViceCaptain ? '★ Vice Captain (tap to unset)' : 'Make Vice Captain (1.5× points)'}</span>
          </button>

          {/* Remove */}
          <button
            onClick={() => { onRemove(); onClose() }}
            disabled={isLocked}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm transition-all hover:bg-red-50',
              isLocked && 'opacity-50 cursor-not-allowed',
            )}
          >
            <span className="w-8 h-8 rounded-full bg-red-100 text-red-500 font-black text-sm flex items-center justify-center flex-shrink-0">
              ✕
            </span>
            <span>Remove from team</span>
          </button>
        </div>

        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-sm transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ── Main pitch component ───────────────────────────────────────────────────────

export default function PitchView({
  selectedPlayers,
  captainId,
  vcId,
  playingXI,
  creditTrends,
  selectionPercentages,
  onRemove,
  onSetCaptain,
  onSetVC,
  isLocked,
}: PitchViewProps) {
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null)

  const playingSet = new Set(playingXI)
  const modalPlayer = selectedPlayers.find((p) => p.id === modalPlayerId) ?? null

  const grouped = PITCH_ROWS.reduce<Record<string, Player[]>>((acc, { role }) => {
    acc[role] = selectedPlayers.filter((p) => p.role === role)
    return acc
  }, {})

  if (selectedPlayers.length === 0) {
    return (
      <div className="relative rounded-2xl overflow-hidden bg-[#1a472a] min-h-[440px] flex flex-col items-center justify-center gap-3 p-6">
        <PitchLines />
        <div className="relative z-10 text-center">
          <p className="text-white/60 text-sm font-medium">No players selected yet</p>
          <p className="text-white/40 text-xs mt-1">Pick players from the pool on the left</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Pitch */}
      <div className="relative rounded-2xl overflow-hidden bg-[#1a5c30] select-none">
        {/* Pitch background markings */}
        <PitchLines />

        {/* Rows */}
        <div className="relative z-10 flex flex-col gap-2 py-3 px-2">
          {PITCH_ROWS.map(({ role, label }) => {
            const rowPlayers = grouped[role] ?? []
            if (rowPlayers.length === 0) return null
            return (
              <div key={role} className="flex flex-col items-center gap-1">
                {/* Role label strip */}
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/50 leading-none">
                  {label}
                </span>
                {/* Player cards */}
                <div
                  className={cn(
                    'flex gap-1.5 justify-center flex-wrap',
                  )}
                >
                  {rowPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="w-[78px] cursor-pointer"
                      onClick={() => setModalPlayerId(player.id)}
                    >
                      <PlayerCard
                        id={player.id}
                        name={player.name}
                        role={player.role}
                        price={player.price}
                        size="full"
                        isCaptain={captainId === player.id}
                        isViceCaptain={vcId === player.id}
                        isPlaying={playingSet.has(player.id)}
                        creditTrend={creditTrends[player.id] ?? 'neutral'}
                        selectionPct={selectionPercentages[player.id]}
                        className="text-[10px]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Locked overlay */}
        {isLocked && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[2px] rounded-2xl">
            <div className="bg-white/90 rounded-xl px-5 py-3 text-center shadow-lg">
              <p className="text-2xl mb-1">🏏</p>
              <p className="text-sm font-bold text-[#262162]">Match In Progress</p>
              <p className="text-xs text-gray-500">Team locked while playing</p>
            </div>
          </div>
        )}
      </div>

      {/* C/VC assign hint */}
      {!isLocked && selectedPlayers.length > 0 && (
        <p className="text-center text-xs text-gray-400 mt-1">
          Tap a player to assign C / VC or remove
        </p>
      )}

      {/* C/VC modal */}
      {modalPlayer && (
        <CaptainModal
          player={modalPlayer}
          isCaptain={captainId === modalPlayer.id}
          isViceCaptain={vcId === modalPlayer.id}
          onSetCaptain={() => onSetCaptain(modalPlayer.id)}
          onSetVC={() => onSetVC(modalPlayer.id)}
          onRemove={() => onRemove(modalPlayer.id)}
          onClose={() => setModalPlayerId(null)}
          isLocked={isLocked}
        />
      )}
    </>
  )
}

// ── Pitch markings SVG ────────────────────────────────────────────────────────

function PitchLines() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* Outer boundary */}
      <div className="absolute inset-[6px] rounded-xl border border-white/10" />
      {/* Centre strip */}
      <div className="absolute left-1/2 top-[15%] bottom-[15%] w-[14%] -translate-x-1/2 bg-[#c8a84b]/15 rounded-sm" />
      {/* Crease lines */}
      <div className="absolute left-[10%] right-[10%] top-[22%] h-px bg-white/10" />
      <div className="absolute left-[10%] right-[10%] bottom-[22%] h-px bg-white/10" />
      {/* Faint horizontal dividers between rows */}
      <div className="absolute left-0 right-0 top-1/2 h-px bg-white/5" />
    </div>
  )
}
