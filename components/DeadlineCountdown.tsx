'use client'

import { useState, useEffect } from 'react'

interface Props {
  /** ISO string — 30 min before the earliest match (lockStart) */
  deadline: string
  /** ISO string — 30 min after the latest match starts (lockEnd). When passed the lock lifts. */
  lockUntil?: string
  className?: string
}

function getRemainingMs(isoTarget: string) {
  return new Date(isoTarget).getTime() - Date.now()
}

function formatCountdown(ms: number) {
  if (ms <= 0) return null
  const hours   = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((ms % (1000 * 60)) / 1000)
  return { hours, minutes, seconds }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function DeadlineCountdown({ deadline, lockUntil, className = '' }: Props) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const toDeadline = getRemainingMs(deadline)
  const toLockEnd  = lockUntil ? getRemainingMs(lockUntil) : null

  // ── State 3: lock window fully passed ──────────────────────────────────────
  if (toDeadline <= 0 && (toLockEnd === null || toLockEnd <= 0)) {
    // Silent — user is freely editing for the next gameweek
    return null
  }

  // ── State 2: match in progress (locked) ────────────────────────────────────
  if (toDeadline <= 0 && toLockEnd !== null && toLockEnd > 0) {
    const cd = formatCountdown(toLockEnd)
    return (
      <div className={`flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 ${className}`}>
        <span className="text-lg">🏏</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-orange-800">
            Match in progress — team locked until {lockUntil ? formatTime(lockUntil) : ''}
          </p>
          {cd && (
            <p className="text-xs text-orange-700 tabular-nums mt-0.5">
              Unlocks in{' '}
              {cd.hours > 0 && `${cd.hours}h `}
              {String(cd.minutes).padStart(2, '0')}m{' '}
              {String(cd.seconds).padStart(2, '0')}s
              {' '}— changes free again after unlock
            </p>
          )}
        </div>
        <span className="text-xs font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full shrink-0">
          In Progress
        </span>
      </div>
    )
  }

  // ── State 1: counting down to deadline ─────────────────────────────────────
  const cd = formatCountdown(toDeadline)
  if (!cd) return null

  const urgent = cd.hours === 0 && cd.minutes < 30

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
        urgent
          ? 'border-orange-200 bg-orange-50'
          : 'border-[#262162]/20 bg-[#eeedf8]'
      } ${className}`}
    >
      <span className="text-lg">{urgent ? '⚠️' : '⏰'}</span>
      <div className="flex-1">
        <p className={`text-xs font-medium ${urgent ? 'text-orange-700' : 'text-[#262162]'}`}>
          Deadline to lock in your team
        </p>
        <p className={`text-lg font-bold tabular-nums ${urgent ? 'text-orange-700' : 'text-[#262162]'}`}>
          {cd.hours > 0 && `${cd.hours}h `}
          {String(cd.minutes).padStart(2, '0')}m{' '}
          {String(cd.seconds).padStart(2, '0')}s
        </p>
      </div>
      {urgent && (
        <span className="text-xs font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
          Closing soon
        </span>
      )}
    </div>
  )
}
