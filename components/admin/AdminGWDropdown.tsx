'use client'

import { useState } from 'react'
import { cn }       from '@/lib/utils'

interface GW {
  id:         string
  name:       string
  number:     number
  match_date: string
}

interface Props {
  gameweeks: GW[]
}

export default function AdminGWDropdown({ gameweeks }: Props) {
  const [selected, setSelected] = useState('')
  const [status,   setStatus]   = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message,  setMessage]  = useState('')

  if (gameweeks.length === 0) return null

  async function handleGenerate() {
    if (!selected || status === 'loading') return
    setStatus('loading')
    setMessage('')
    try {
      const res  = await fetch(`/api/admin/generate-contests/gameweek/${selected}`, { method: 'POST' })
      const json = await res.json() as { created?: number; message?: string; error?: string }
      if (res.ok) {
        setStatus('done')
        setMessage(json.message ?? `${json.created ?? 0} contests created`)
      } else {
        setStatus('error')
        setMessage(json.error ?? 'Error')
      }
    } catch {
      setStatus('error')
      setMessage('Network error')
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {message && (
        <span className={cn('text-xs font-semibold', status === 'done' ? 'text-green-600' : 'text-red-500')}>
          {status === 'done' ? '✓ ' : ''}{message}
        </span>
      )}
      <select
        value={selected}
        onChange={e => { setSelected(e.target.value); setStatus('idle'); setMessage('') }}
        className="px-3 py-2 rounded-xl border border-[#C9A84C]/30 bg-[#fef9ee] text-[#C9A84C] text-xs font-bold focus:outline-none focus:border-[#C9A84C] transition-colors"
      >
        <option value="">Select Gameweek…</option>
        {gameweeks.map(gw => (
          <option key={gw.id} value={gw.id}>
            {gw.name} · {new Date(gw.match_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </option>
        ))}
      </select>
      <button
        onClick={() => void handleGenerate()}
        disabled={!selected || status === 'loading'}
        className="px-3 py-2 rounded-xl bg-[#fef9ee] border border-[#C9A84C]/40 text-[#C9A84C] text-xs font-black hover:bg-[#fef3d0] disabled:opacity-50 transition-colors"
      >
        {status === 'loading' ? 'Generating…' : '🏏 Gen GW Contests'}
      </button>
    </div>
  )
}
