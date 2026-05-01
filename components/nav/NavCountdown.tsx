'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { computeMatchDayLockWindow } from '@/lib/deadline'
import type { Match } from '@/types'

function getRemainingMs(iso: string) {
  return new Date(iso).getTime() - Date.now()
}

function formatNavCountdown(ms: number): string {
  if (ms <= 0) return ''
  const h = Math.floor(ms / (1000 * 60 * 60))
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  const s = Math.floor((ms % (1000 * 60)) / 1000)
  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  parts.push(`${String(m).padStart(2, '0')}m`)
  parts.push(`${String(s).padStart(2, '0')}s`)
  return parts.join(' ')
}

export default function NavCountdown() {
  const [deadline, setDeadline]     = useState<string | null>(null)
  const [lockUntil, setLockUntil]   = useState<string | null>(null)
  const [, setTick]                 = useState(0)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: season } = await supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .single()
      if (!season) return

      const { data: matches } = await supabase
        .from('matches')
        .select('id, match_date')
        .eq('season_id', season.id)
        .eq('status', 'upcoming')
        .order('match_date')

      if (!matches || matches.length === 0) return

      const win = computeMatchDayLockWindow(matches as Pick<Match, 'match_date'>[])
      if (win) {
        setDeadline(win.lockStart.toISOString())
        setLockUntil(win.lockEnd.toISOString())
      }
    }
    load()
  }, [])

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  if (!deadline) return null

  const toDeadline = getRemainingMs(deadline)
  const toLockEnd  = lockUntil ? getRemainingMs(lockUntil) : null

  // Post-lock window — nothing to show
  if (toDeadline <= 0 && (toLockEnd === null || toLockEnd <= 0)) return null

  // Match in progress
  if (toDeadline <= 0 && toLockEnd !== null && toLockEnd > 0) {
    return (
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-500/20 border border-orange-400/40">
        <span className="text-orange-300 text-xs font-bold tracking-wide uppercase">🏏 In Progress</span>
      </div>
    )
  }

  // Counting down
  const cd = formatNavCountdown(toDeadline)
  if (!cd) return null

  const urgent = toDeadline < 30 * 60 * 1000

  return (
    <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${
      urgent
        ? 'bg-orange-500/20 border-orange-400/40'
        : 'bg-white/10 border-white/20'
    }`}>
      <span className="text-xs text-white/60 font-medium whitespace-nowrap">Locks in</span>
      <span className={`text-sm font-bold tabular-nums whitespace-nowrap ${urgent ? 'text-orange-300' : 'text-[#fbf927]'}`}>
        {cd}
      </span>
    </div>
  )
}
