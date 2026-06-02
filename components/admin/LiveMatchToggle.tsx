'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  matchId:        string
  matchNumber:    number
  opponentTeam:   string
  status:         'upcoming' | 'live' | 'completed'
  playCricketId:  string | null | undefined
}

export default function LiveMatchToggle({
  matchId,
  matchNumber,
  opponentTeam,
  status,
  playCricketId,
}: Props) {
  const router  = useRouter()
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setStatus(next: 'live' | 'upcoming' | 'completed') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/set-match-status', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ matchId, status: next }),
      })
      const j = await res.json() as { error?: string }
      if (!res.ok) { setError(j.error ?? 'Failed'); return }

      // If ending the match, trigger a final points sync
      if (next === 'completed' && playCricketId) {
        // Best-effort — don't block on result
        fetch('/api/admin/match-by-pc-id?pc_id=' + playCricketId)
          .then(r => r.json() as Promise<{ data?: { id: string } | null }>)
          .then(({ data }) => {
            if (data?.id) {
              fetch('/api/sync/results', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ match_id: data.id, pc_match_id: playCricketId }),
              }).catch(() => undefined)
            }
          })
          .catch(() => undefined)
      }

      router.refresh()
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* ── LIVE badge ──────────────────────────────────────────── */}
      {status === 'live' && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-green-100 text-green-700 border border-green-300">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
          LIVE
        </span>
      )}

      {/* ── Set Live button (upcoming → live) ────────────────────── */}
      {status === 'upcoming' && (
        <button
          onClick={() => void setStatus('live')}
          disabled={busy}
          className="px-2.5 py-1 rounded-lg text-[11px] font-black border border-green-400 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50"
          title={`Set Match ${matchNumber} vs ${opponentTeam} to LIVE`}
        >
          {busy ? '…' : '▶ Set Live'}
        </button>
      )}

      {/* ── End Match button (live → completed) ──────────────────── */}
      {status === 'live' && (
        <button
          onClick={() => void setStatus('completed')}
          disabled={busy}
          className="px-2.5 py-1 rounded-lg text-[11px] font-black border border-red-300 text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
          title="End match and run final points sync"
        >
          {busy ? '…' : '■ End Match'}
        </button>
      )}

      {/* ── Re-open button (completed → upcoming) ────────────────── */}
      {status === 'completed' && (
        <button
          onClick={() => void setStatus('upcoming')}
          disabled={busy}
          className="px-2.5 py-1 rounded-lg text-[11px] font-black border border-gray-300 text-gray-500 bg-white hover:border-[#C9A84C]/50 hover:text-[#C9A84C] transition-colors disabled:opacity-50"
          title="Re-open match"
        >
          {busy ? '…' : '↺ Re-open'}
        </button>
      )}

      {error && (
        <span className="text-[11px] text-red-500 font-medium">{error}</span>
      )}
    </div>
  )
}
