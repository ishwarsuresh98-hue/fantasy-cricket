'use client'

import { cn } from '@/lib/utils'
import { PLAYER_ROLE_LABELS } from '@/lib/scoring'
import type { PlayerRole } from '@/types'

// ── Role colours ──────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<PlayerRole, string> = {
  batsman:       'bg-blue-100 text-blue-700',
  bowler:        'bg-[#fceaea] text-[#b5211e]',
  all_rounder:   'bg-[#1c1c1c] text-[#C9A84C]',
  wicket_keeper: 'bg-[#fef9ee] text-[#a16207]',
}

// Avatar background per role (darker shade for contrast against white initials)
const ROLE_AVATAR: Record<PlayerRole, string> = {
  batsman:       'bg-blue-600',
  bowler:        'bg-[#b5211e]',
  all_rounder:   'bg-[#f0f0f0]',
  wicket_keeper: 'bg-[#a16207]',
}

const ROLE_SHORT: Record<PlayerRole, string> = {
  wicket_keeper: 'WK',
  batsman:       'BAT',
  all_rounder:   'AR',
  bowler:        'BOWL',
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

/**
 * Inline mini bar chart — up to 3 bars representing recent base_points.
 * Heights are proportional to the max value in the series.
 * A zero/null bar renders at minimum height in a muted colour.
 */
function Sparkline({ points }: { points: (number | null)[] }) {
  const values = points.slice(-3)
  const max    = Math.max(...values.filter((v): v is number => v !== null), 1)

  return (
    <div className="flex items-end gap-[3px] h-5">
      {values.map((v, i) => {
        const height = v != null && v > 0 ? Math.max(20, Math.round((v / max) * 100)) : 15
        const colour =
          v == null || v === 0
            ? 'bg-gray-200'
            : v >= max * 0.8
            ? 'bg-green-500'
            : v >= max * 0.4
            ? 'bg-[#C9A84C]'
            : 'bg-orange-400'
        return (
          <div
            key={i}
            className={cn('w-[5px] rounded-sm transition-all', colour)}
            style={{ height: `${height}%` }}
            title={v != null ? `${v.toFixed(1)} pts` : 'DNP'}
          />
        )
      })}
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlayerCardProps {
  /** Required player fields */
  id:   string
  name: string
  role: PlayerRole
  /** Credit value (e.g. 9.5) */
  price: number

  /** Visual variant */
  size?: 'compact' | 'full'

  /** Recent base_points (up to last 3). Null = did not play. */
  recentPoints?: (number | null)[]

  /** Credit change since last match */
  creditTrend?: 'up' | 'down' | 'neutral'

  /** Selection state (for team-builder usage) */
  isSelected?:    boolean
  isCaptain?:     boolean
  isViceCaptain?: boolean

  /** Whether this player is in the confirmed Playing XI */
  isPlaying?: boolean

  /** % of teams that have selected this player (0–100) */
  selectionPct?: number

  /** Points earned this GW (shown on compact rows in team history) */
  gwPoints?: number

  /** Click handler */
  onClick?: () => void

  /** Extra class names on the root element */
  className?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlayerCard({
  name,
  role,
  price,
  size = 'compact',
  recentPoints,
  creditTrend = 'neutral',
  isSelected,
  isCaptain,
  isViceCaptain,
  isPlaying,
  selectionPct,
  gwPoints,
  onClick,
  className,
}: PlayerCardProps) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  if (size === 'compact') {
    return (
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
        className={cn(
          'flex items-center gap-2.5 px-3 py-2 transition-colors',
          onClick && 'cursor-pointer hover:bg-[#1c1c1c]',
          isSelected && 'bg-green-50',
          className,
        )}
      >
        {/* C / VC badge OR avatar */}
        {isCaptain ? (
          <span className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#C9A84C] text-[#0b0b0b] text-[11px] font-black">
            C
          </span>
        ) : isViceCaptain ? (
          <span className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 text-gray-600 text-[11px] font-black">
            V
          </span>
        ) : (
          <span
            className={cn(
              'flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-[#0b0b0b] text-[11px] font-bold',
              ROLE_AVATAR[role],
            )}
          >
            {initials}
          </span>
        )}

        {/* Name + role */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn(
              'text-sm font-semibold truncate',
              isSelected ? 'text-green-800' : 'text-[#d4d4d4]',
            )}>
              {name}
            </span>
            {isPlaying && (
              <span className="flex-shrink-0 text-[9px] font-bold px-1 py-0 rounded bg-green-100 text-green-700 uppercase tracking-wide">
                Playing
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn('text-[10px] px-1.5 py-0 rounded font-medium', ROLE_BADGE[role])}>
              {ROLE_SHORT[role]}
            </span>
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
              {Number(price).toFixed(1)} cr
              {creditTrend === 'up'   && <span className="text-green-600 font-bold">↑</span>}
              {creditTrend === 'down' && <span className="text-red-500  font-bold">↓</span>}
            </span>
          </div>
        </div>

        {/* Sparkline */}
        {recentPoints && recentPoints.length > 0 && (
          <div className="flex-shrink-0">
            <Sparkline points={recentPoints} />
          </div>
        )}

        {/* GW points */}
        {gwPoints !== undefined && (
          <span className={cn(
            'flex-shrink-0 w-9 text-right text-sm font-bold',
            gwPoints > 0 ? 'text-[#C9A84C]' : 'text-gray-300',
          )}>
            {gwPoints > 0
              ? gwPoints % 1 === 0 ? gwPoints : gwPoints.toFixed(1)
              : '—'}
          </span>
        )}
      </div>
    )
  }

  // ── Full size ───────────────────────────────────────────────────────────────

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={cn(
        'relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 text-center transition-all duration-150 select-none',
        isSelected
          ? 'bg-green-50 border-green-400 shadow-md shadow-green-100'
          : 'bg-[#f0f0f0] border-[#d8d8d8] hover:border-[#C9A84C]/40 hover:bg-[#1c1c1c]',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {/* C / VC ring around avatar */}
      <div className={cn(
        'relative w-12 h-12 rounded-full ring-2 ring-offset-1',
        isCaptain      ? 'ring-[#C9A84C]' :
        isViceCaptain  ? 'ring-gray-300'  :
        isSelected     ? 'ring-green-400' :
                         'ring-transparent',
      )}>
        <span className={cn(
          'flex items-center justify-center w-full h-full rounded-full text-[#0b0b0b] font-bold text-base',
          ROLE_AVATAR[role],
        )}>
          {initials}
        </span>

        {/* C / VC badge overlaid on avatar */}
        {(isCaptain || isViceCaptain) && (
          <span className={cn(
            'absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white',
            isCaptain ? 'bg-[#C9A84C] text-[#0b0b0b]' : 'bg-gray-200 text-gray-600',
          )}>
            {isCaptain ? 'C' : 'V'}
          </span>
        )}
      </div>

      {/* Name */}
      <div className="w-full min-w-0">
        <p className={cn(
          'text-xs font-semibold leading-tight line-clamp-2',
          isSelected ? 'text-green-800' : 'text-[#d4d4d4]',
        )}>
          {name}
        </p>
      </div>

      {/* Role badge */}
      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', ROLE_BADGE[role])}>
        {PLAYER_ROLE_LABELS[role]}
      </span>

      {/* Credit + trend */}
      <div className="flex items-center gap-0.5 text-xs text-gray-500">
        <span className="font-semibold text-[#aaaaaa]">{Number(price).toFixed(1)}</span>
        <span className="text-[10px]">cr</span>
        {creditTrend === 'up'   && <span className="text-green-600 font-bold text-[11px]">↑</span>}
        {creditTrend === 'down' && <span className="text-red-500  font-bold text-[11px]">↓</span>}
      </div>

      {/* Sparkline */}
      {recentPoints && recentPoints.length > 0 && (
        <Sparkline points={recentPoints} />
      )}

      {/* Selection % */}
      {selectionPct !== undefined && (
        <span className="text-[10px] text-gray-400">{selectionPct}% selected</span>
      )}

      {/* Playing XI badge */}
      {isPlaying && (
        <span className="absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500 text-[#0b0b0b] uppercase tracking-wide">
          ✓ Playing
        </span>
      )}

      {/* Selected tick */}
      {isSelected && !isCaptain && !isViceCaptain && (
        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-[#0b0b0b]" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
          </svg>
        </span>
      )}
    </div>
  )
}
