'use client'

import { useState, useEffect } from 'react'

interface Props {
  /** ISO string — lockStart (1 hour before earliest match). null = no upcoming matches. */
  deadline: string | null
  /** ISO string — lockEnd (30 min after latest match starts). */
  lockUntil: string | null
  /** e.g. "Match 3 vs Marlow Cricket Club" — shown above the clock */
  matchLabel?: string
  /** Human-readable date string — shown below the match label */
  matchDate?: string
}

function getRemainingMs(iso: string) {
  return new Date(iso).getTime() - Date.now()
}

function splitCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return { h, m, s }
}

function DigitBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="bg-[#1a1748] rounded-xl px-5 py-4 min-w-[72px] sm:min-w-[88px] text-center shadow-inner border border-white/10">
        <span className="text-4xl sm:text-5xl font-black tabular-nums text-[#fbf927] tracking-tight leading-none">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="text-xs font-semibold text-white/50 uppercase tracking-widest mt-2">{label}</span>
    </div>
  )
}

export default function HeroCountdown({ deadline, lockUntil, matchLabel, matchDate }: Props) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // ── No upcoming matches ─────────────────────────────────────────────────────
  if (!deadline) {
    return (
      <div className="w-full rounded-2xl bg-[#262162] px-6 py-8 flex flex-col items-center gap-3 text-center shadow-lg">
        <span className="text-4xl">📅</span>
        <p className="text-lg font-bold text-white/70 uppercase tracking-wider">Next Gameweek Not Scheduled Yet</p>
      </div>
    )
  }

  const toDeadline = getRemainingMs(deadline)
  const toLockEnd  = lockUntil ? getRemainingMs(lockUntil) : null

  // ── Post lock window — silent (same as "not scheduled") ────────────────────
  if (toDeadline <= 0 && (toLockEnd === null || toLockEnd <= 0)) {
    return (
      <div className="w-full rounded-2xl bg-[#262162] px-6 py-8 flex flex-col items-center gap-3 text-center shadow-lg">
        <span className="text-4xl">📅</span>
        <p className="text-lg font-bold text-white/70 uppercase tracking-wider">Next Gameweek Not Scheduled Yet</p>
      </div>
    )
  }

  // ── Match in progress ───────────────────────────────────────────────────────
  if (toDeadline <= 0 && toLockEnd !== null && toLockEnd > 0) {
    const { h, m, s } = splitCountdown(toLockEnd)
    return (
      <div className="w-full rounded-2xl bg-[#262162] px-6 py-8 flex flex-col items-center gap-6 shadow-lg">
        <div className="flex flex-col items-center gap-1">
          <span className="text-3xl">🏏</span>
          <p className="text-xl sm:text-2xl font-black text-white uppercase tracking-widest">Match In Progress</p>
          <p className="text-sm text-white/50">Team locked — unlocks when matches finish</p>
        </div>
        <div className="flex items-end gap-3 sm:gap-5">
          <DigitBox value={h} label="Hours" />
          <span className="text-3xl font-black text-[#fbf927]/60 mb-5">:</span>
          <DigitBox value={m} label="Minutes" />
          <span className="text-3xl font-black text-[#fbf927]/60 mb-5">:</span>
          <DigitBox value={s} label="Seconds" />
        </div>
        <p className="text-xs text-orange-300 font-semibold uppercase tracking-wider">Unlocks in {h > 0 ? `${h}h ` : ''}{String(m).padStart(2,'0')}m {String(s).padStart(2,'0')}s</p>
      </div>
    )
  }

  // ── Counting down to deadline ───────────────────────────────────────────────
  const { h, m, s } = splitCountdown(toDeadline)
  const urgent = toDeadline < 30 * 60 * 1000

  return (
    <div className={`w-full rounded-2xl px-6 py-8 flex flex-col items-center gap-6 shadow-lg transition-colors ${
      urgent ? 'bg-[#3d1a1a]' : 'bg-[#262162]'
    }`}>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className={`text-xs font-bold uppercase tracking-[0.25em] ${urgent ? 'text-orange-300' : 'text-white/50'}`}>
          {urgent ? '⚠️ Transfers Closing Soon' : '🏏 Next Match'}
        </p>
        {matchLabel && (
          <p className="text-xl sm:text-2xl font-black text-white">
            {matchLabel}
          </p>
        )}
        {matchDate && (
          <p className="text-sm text-white/50">{matchDate}</p>
        )}
        {!matchLabel && (
          <p className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider">
            Gameweek Locks In
          </p>
        )}
      </div>

      <div>
        <p className={`text-center text-[10px] font-bold uppercase tracking-widest mb-3 ${urgent ? 'text-orange-300' : 'text-[#fbf927]/70'}`}>
          Transfers close in
        </p>
        <div className="flex items-end gap-3 sm:gap-5">
          <DigitBox value={h} label="Hours" />
          <span className="text-3xl font-black text-[#fbf927]/60 mb-5">:</span>
          <DigitBox value={m} label="Minutes" />
          <span className="text-3xl font-black text-[#fbf927]/60 mb-5">:</span>
          <DigitBox value={s} label="Seconds" />
        </div>
      </div>

      <p className={`text-xs font-semibold uppercase tracking-wider ${urgent ? 'text-orange-300' : 'text-white/40'}`}>
        Lock your squad before time runs out
      </p>
    </div>
  )
}
