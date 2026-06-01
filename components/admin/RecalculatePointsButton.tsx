'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

type State = 'idle' | 'loading' | 'done' | 'error'

export default function RecalculatePointsButton() {
  const [state, setState]   = useState<State>('idle')
  const [count, setCount]   = useState<number | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function handleClick() {
    if (state === 'loading') return
    setState('loading')
    setErrMsg(null)
    setCount(null)

    try {
      const res  = await fetch('/api/admin/recalculate-points', { method: 'POST' })
      const data = await res.json()

      if (!res.ok || data.error) {
        setErrMsg(data.error ?? 'Unknown error')
        setState('error')
        return
      }

      setCount(data.rowsUpdated)
      setState('done')
    } catch {
      setErrMsg('Network error — could not reach the server.')
      setState('error')
    }
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleClick}
        disabled={state === 'loading'}
        variant="outline"
        size="sm"
        className="border-[#C9A84C]/30 text-[#C9A84C] hover:bg-[#fef9ee]"
      >
        {state === 'loading' ? 'Recalculating…' : '🔄 Recalculate All Points'}
      </Button>

      {state === 'done' && count !== null && (
        <p className="text-xs text-green-700 font-medium">
          ✓ Recalculated points for {count} performance{count !== 1 ? 's' : ''}.
          All fantasy team totals have been updated.
        </p>
      )}
      {state === 'error' && errMsg && (
        <p className="text-xs text-red-600">{errMsg}</p>
      )}
    </div>
  )
}
