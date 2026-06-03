'use client'

import { useState, useEffect } from 'react'

interface GameweekMatch {
  our_team?: string | null
  opponent_team: string
  venue: string | null
  match_date: string
}

interface Props {
  /** ISO string — lockStart (1 hour before earliest match). null = no upcoming matches. */
  deadline: string | null
  /** ISO string — lockEnd (30 min after latest match starts). */
  lockUntil: string | null
  /** e.g. "GAMEWEEK 1 — 6 June 2026" */
  gameweekLabel?: string
  /** All matches in the current gameweek */
  gameweekMatches?: GameweekMatch[]
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
      <div className="bg-[#fafafa] rounded-xl px-5 py-4 min-w-[72px] sm:min-w-[88px] text-center shadow-inner border border-gray-200">
        <span className="text-4xl sm:text-5xl font-black tabular-nums text-[#C9A84C] tracking-tight leading-none">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="text-xs font-semibold text-[#0b0b0b]/50 uppercase tracking-widest mt-2">{label}</span>
    </div>
  )
}

function MatchList({ matches }: { matches: GameweekMatch[] }) {
  return (
    <div className="w-full space-y-1.5">
      {matches.map((m, i) => {
        const label = m.our_team
          ? `${m.our_team} vs ${m.opponent_team}`
          : `vs ${m.opponent_team}`
        // Use UTC-based formatting to avoid Node/browser locale differences
        const d = new Date(m.match_date)
        const hh = d.getHours()
        const mm = String(d.getMinutes()).padStart(2, '0')
        const time = `${hh % 12 || 12}:${mm}${hh < 12 ? 'am' : 'pm'}`
        return (
          <div key={i} className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-[#fafafa] border border-gray-200 text-left">
            <div className="min-w-0">
              <p className="text-base font-bold text-[#0b0b0b]/80 leading-tight truncate">{label}</p>
              {m.venue && <p className="text-sm text-[#0b0b0b]/40 truncate">{m.venue}</p>}
            </div>
            <span className="text-base font-semibold text-[#C9A84C] whitespace-nowrap flex-shrink-0 mt-0.5">{time}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function HeroCountdown({ deadline, lockUntil, gameweekLabel, gameweekMatches }: Props) {
  const [mounted, setMounted] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    setMounted(true)
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Pre-hydration: render a stable skeleton that matches the server output ──
  // Date.now() differs between server and client, so we must not call
  // getRemainingMs() until after mount. This eliminates hydration error #418.
  if (!mounted) {
    return (
      <div className="w-full rounded-2xl bg-[#f0f0f0] px-6 py-6 flex flex-col items-center gap-5 shadow-lg">
        <div className="flex flex-col items-center gap-1 text-center w-full">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#0b0b0b]/50">🏏 Current Gameweek</p>
          {gameweekLabel && (
            <p className="text-base font-black uppercase tracking-wider text-[#0b0b0b]">{gameweekLabel}</p>
          )}
        </div>
        {gameweekMatches && gameweekMatches.length > 0 && <MatchList matches={gameweekMatches} />}
        <div>
          <p className="text-center text-[10px] font-bold uppercase tracking-widest mb-3 text-[#C9A84C]/70">
            Gameweek locks in
          </p>
          <div className="flex items-end gap-3 sm:gap-5">
            <DigitBox value={0} label="Hours" />
            <span className="text-3xl font-black text-[#C9A84C]/60 mb-5">:</span>
            <DigitBox value={0} label="Minutes" />
            <span className="text-3xl font-black text-[#C9A84C]/60 mb-5">:</span>
            <DigitBox value={0} label="Seconds" />
          </div>
        </div>
      </div>
    )
  }

  // ── No upcoming matches ─────────────────────────────────────────────────────
  if (!deadline) {
    return (
      <div className="w-full rounded-2xl bg-[#f0f0f0] px-6 py-8 flex flex-col items-center gap-3 text-center shadow-lg">
        <span className="text-4xl">📅</span>
        <p className="text-lg font-bold text-[#0b0b0b]/70 uppercase tracking-wider">Next Gameweek Not Scheduled Yet</p>
      </div>
    )
  }

  const toDeadline = getRemainingMs(deadline)
  const toLockEnd  = lockUntil ? getRemainingMs(lockUntil) : null

  // ── Post lock window — silent (same as "not scheduled") ────────────────────
  if (toDeadline <= 0 && (toLockEnd === null || toLockEnd <= 0)) {
    return (
      <div className="w-full rounded-2xl bg-[#f0f0f0] px-6 py-8 flex flex-col items-center gap-3 text-center shadow-lg">
        <span className="text-4xl">📅</span>
        <p className="text-lg font-bold text-[#0b0b0b]/70 uppercase tracking-wider">Next Gameweek Not Scheduled Yet</p>
      </div>
    )
  }

  // ── Match in progress ───────────────────────────────────────────────────────
  if (toDeadline <= 0 && toLockEnd !== null && toLockEnd > 0) {
    const { h, m, s } = splitCountdown(toLockEnd)
    return (
      <div className="w-full rounded-2xl bg-[#f0f0f0] px-6 py-8 flex flex-col items-center gap-6 shadow-lg">
        <div className="flex flex-col items-center gap-1">
          <span className="text-3xl">🏏</span>
          <p className="text-xl sm:text-2xl font-black text-[#0b0b0b] uppercase tracking-widest">Match In Progress</p>
          <p className="text-sm text-[#0b0b0b]/50">Team locked — unlocks when matches finish</p>
        </div>
        <div className="flex items-end gap-3 sm:gap-5">
          <DigitBox value={h} label="Hours" />
          <span className="text-3xl font-black text-[#C9A84C]/60 mb-5">:</span>
          <DigitBox value={m} label="Minutes" />
          <span className="text-3xl font-black text-[#C9A84C]/60 mb-5">:</span>
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
    <div className={`w-full rounded-2xl px-6 py-6 flex flex-col items-center gap-5 shadow-lg transition-colors ${
      urgent ? 'bg-[#3d1a1a]' : 'bg-[#f0f0f0]'
    }`}>
      <div className="flex flex-col items-center gap-1 text-center w-full">
        <p className={`text-xs font-bold uppercase tracking-[0.25em] ${urgent ? 'text-orange-300' : 'text-[#0b0b0b]/50'}`}>
          {urgent ? '⚠️ Gameweek Closing Soon' : '🏏 Current Gameweek'}
        </p>
        {gameweekLabel && (
          <p className={`text-base font-black uppercase tracking-wider ${urgent ? 'text-orange-100' : 'text-[#0b0b0b]'}`}>
            {gameweekLabel}
          </p>
        )}
      </div>

      {gameweekMatches && gameweekMatches.length > 0 && (
        <MatchList matches={gameweekMatches} />
      )}

      <div>
        <p className={`text-center text-[10px] font-bold uppercase tracking-widest mb-3 ${urgent ? 'text-orange-300' : 'text-[#C9A84C]/70'}`}>
          Gameweek locks in
        </p>
        <div className="flex items-end gap-3 sm:gap-5">
          <DigitBox value={h} label="Hours" />
          <span className="text-3xl font-black text-[#C9A84C]/60 mb-5">:</span>
          <DigitBox value={m} label="Minutes" />
          <span className="text-3xl font-black text-[#C9A84C]/60 mb-5">:</span>
          <DigitBox value={s} label="Seconds" />
        </div>
      </div>

      <p className={`text-xs font-semibold uppercase tracking-wider ${urgent ? 'text-orange-300' : 'text-[#0b0b0b]/40'}`}>
        Lock your squad before time runs out
      </p>
    </div>
  )
}
