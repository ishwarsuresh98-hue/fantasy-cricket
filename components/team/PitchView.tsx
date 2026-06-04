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
  // 15-player squad: subs in priority order (index 0 = SUB 1)
  substitutePlayers?: Player[]
  onSubPriorityUp?:   (playerId: string) => void
  onSubPriorityDown?: (playerId: string) => void
  onRemoveSub?:       (playerId: string) => void
}

// Pitch rows — top to bottom display order
const PITCH_ROWS: { role: PlayerRole; label: string }[] = [
  { role: 'bowler',        label: 'Bowlers' },
  { role: 'all_rounder',   label: 'All-Rounders' },
  { role: 'batsman',       label: 'Batters' },
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-200 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xs bg-[#f0f0f0] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#f0f0f0] px-5 py-4">
          <p className="text-[#0b0b0b] font-bold text-base truncate">{player.name}</p>
          <p className="text-[#0b0b0b]/60 text-xs">{player.price} cr</p>
        </div>

        <div className="p-4 space-y-2">
          {/* Captain */}
          <button
            onClick={() => { onSetCaptain(); onClose() }}
            disabled={isLocked}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 font-semibold text-sm transition-all',
              isCaptain
                ? 'bg-[#C9A84C] border-[#C9A84C] text-[#C9A84C]'
                : 'border-[#d8d8d8] text-[#aaaaaa] hover:border-[#C9A84C] hover:bg-[#fef9ee]',
              isLocked && 'opacity-50 cursor-not-allowed',
            )}
          >
            <span className="w-8 h-8 rounded-full bg-[#C9A84C] text-[#0b0b0b] font-black text-sm flex items-center justify-center flex-shrink-0">
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
                ? 'bg-gray-200 border-gray-300 text-[#aaaaaa]'
                : 'border-[#d8d8d8] text-[#aaaaaa] hover:border-gray-400 hover:bg-[#f8f8f8]',
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
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-[#f5f5f5]/20 hover:bg-[#f5f5f5]/30 flex items-center justify-center text-[#0b0b0b] text-sm transition-colors"
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
  substitutePlayers = [],
  onSubPriorityUp,
  onSubPriorityDown,
  onRemoveSub,
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
          <p className="text-[#0b0b0b]/60 text-sm font-medium">No players selected yet</p>
          <p className="text-[#0b0b0b]/40 text-xs mt-1">Pick players from the pool on the left</p>
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
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#0b0b0b]/50 leading-none">
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
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-200 backdrop-blur-[2px] rounded-2xl">
            <div className="bg-[#f5f5f5]/90 rounded-xl px-5 py-3 text-center shadow-lg">
              <p className="text-2xl mb-1">🏏</p>
              <p className="text-sm font-bold text-[#C9A84C]">Match In Progress</p>
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

      {/* ── Substitutes bench ────────────────────────────────────────────── */}
      {(substitutePlayers.length > 0 || substitutePlayers.length === 0) && (
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-2">
              Substitutes
            </span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {substitutePlayers.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 py-4 text-center">
              <p className="text-xs text-gray-400">Add 4 substitute players</p>
              <p className="text-[10px] text-gray-300 mt-0.5">They&apos;ll auto-sub in if a starter doesn&apos;t play</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {substitutePlayers.map((player, i) => (
                <div
                  key={player.id}
                  className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2"
                >
                  {/* Priority badge */}
                  <span className="w-6 h-6 rounded-full bg-[#C9A84C]/15 text-[#C9A84C] text-[10px] font-black flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>

                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-800 truncate">{player.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{player.role.replace('_', ' ')}</p>
                  </div>

                  {/* Priority controls */}
                  {!isLocked && (
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => onSubPriorityUp?.(player.id)}
                        disabled={i === 0}
                        className="w-5 h-4 flex items-center justify-center text-gray-400 hover:text-[#C9A84C] disabled:opacity-20 disabled:cursor-not-allowed text-[10px] leading-none"
                        title="Move up"
                      >▲</button>
                      <button
                        onClick={() => onSubPriorityDown?.(player.id)}
                        disabled={i === substitutePlayers.length - 1}
                        className="w-5 h-4 flex items-center justify-center text-gray-400 hover:text-[#C9A84C] disabled:opacity-20 disabled:cursor-not-allowed text-[10px] leading-none"
                        title="Move down"
                      >▼</button>
                    </div>
                  )}

                  {/* Remove */}
                  {!isLocked && (
                    <button
                      onClick={() => onRemoveSub?.(player.id)}
                      className="w-6 h-6 rounded-full bg-red-50 text-red-400 hover:bg-red-100 text-xs flex items-center justify-center shrink-0"
                      title="Remove sub"
                    >×</button>
                  )}
                </div>
              ))}
              {substitutePlayers.length < 4 && (
                <p className="text-[10px] text-center text-gray-400 py-1">
                  Add {4 - substitutePlayers.length} more sub{4 - substitutePlayers.length !== 1 ? 's' : ''} from the player pool
                </p>
              )}
            </div>
          )}
        </div>
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
      <div className="absolute inset-[6px] rounded-xl border border-gray-200" />
      {/* Centre strip */}
      <div className="absolute left-1/2 top-[15%] bottom-[15%] w-[14%] -translate-x-1/2 bg-[#c8a84b]/15 rounded-sm" />
      {/* Crease lines */}
      <div className="absolute left-[10%] right-[10%] top-[22%] h-px bg-[#f5f5f5]/10" />
      <div className="absolute left-[10%] right-[10%] bottom-[22%] h-px bg-[#f5f5f5]/10" />
      {/* Faint horizontal dividers between rows */}
      <div className="absolute left-0 right-0 top-1/2 h-px bg-[#f5f5f5]/5" />
    </div>
  )
}
