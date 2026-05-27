'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  matchId:   string
  matchLabel: string
}

export default function GenerateContestsButton({ matchId, matchLabel }: Props) {
  const [status,  setStatus]  = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleClick() {
    if (status === 'loading') return
    setStatus('loading')
    setMessage('')

    const res  = await fetch(`/api/admin/generate-contests/${matchId}`, { method: 'POST' })
    const json = await res.json() as { created?: number; error?: string }

    if (res.ok) {
      setStatus('done')
      setMessage(`${json.created ?? 0} contest${json.created === 1 ? '' : 's'} created`)
    } else {
      setStatus('error')
      setMessage(json.error ?? 'Error')
    }
  }

  if (status === 'done') {
    return (
      <span className="text-xs text-green-600 font-semibold px-2.5 py-1.5 bg-green-50 border border-green-200 rounded-lg">
        ✓ {message}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {status === 'error' && (
        <span className="text-xs text-red-600 font-semibold">{message}</span>
      )}
      <button
        onClick={handleClick}
        disabled={status === 'loading'}
        title={`Generate contests for ${matchLabel}`}
        className={cn(
          'px-2.5 py-1.5 rounded-lg text-xs font-black transition-colors',
          'bg-[#fef9ee] border border-[#C9A84C]/40 text-[#C9A84C] hover:bg-[#fef3d0] disabled:opacity-60',
        )}
      >
        {status === 'loading' ? 'Generating…' : '⚡ Contests'}
      </button>
    </div>
  )
}
