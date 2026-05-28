'use client'

import { useState }    from 'react'
import { useRouter }   from 'next/navigation'
import { cn }          from '@/lib/utils'

interface Props {
  contestId:     string
  initialStatus: string
  isGameweek:    boolean
}

export default function AdminContestActions({ contestId, initialStatus, isGameweek }: Props) {
  const router = useRouter()
  const [status,  setStatus]  = useState(initialStatus)
  const [busy,    setBusy]    = useState(false)
  const [msg,     setMsg]     = useState('')
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok')

  async function changeStatus(newStatus: string) {
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch(`/api/admin/contests/${contestId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        setStatus(newStatus)
        router.refresh()
      } else {
        const j = await res.json() as { error?: string }
        setMsg(j.error ?? 'Error'); setMsgType('err')
      }
    } catch {
      setMsg('Network error'); setMsgType('err')
    } finally {
      setBusy(false)
    }
  }

  async function calcPoints() {
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch(`/api/admin/contests/${contestId}/calc-gw-points`, { method: 'POST' })
      const j   = await res.json() as { updated?: number; error?: string }
      if (res.ok) {
        setMsg(`✓ ${j.updated ?? 0} teams scored`); setMsgType('ok')
        router.refresh()
      } else {
        setMsg(j.error ?? 'Error'); setMsgType('err')
      }
    } catch {
      setMsg('Network error'); setMsgType('err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {msg && (
        <span className={cn('text-[11px] font-semibold', msgType === 'ok' ? 'text-green-600' : 'text-red-500')}>
          {msg}
        </span>
      )}

      {/* Lock — only when open */}
      {status === 'open' && (
        <button
          onClick={() => void changeStatus('locked')}
          disabled={busy}
          className="px-2 py-1 rounded-lg text-[11px] font-bold border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors"
        >
          Lock
        </button>
      )}

      {/* Reopen — only when locked */}
      {status === 'locked' && (
        <button
          onClick={() => void changeStatus('open')}
          disabled={busy}
          className="px-2 py-1 rounded-lg text-[11px] font-bold border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Reopen
        </button>
      )}

      {/* Cancel — when open or locked */}
      {(status === 'open' || status === 'locked') && (
        <button
          onClick={() => void changeStatus('cancelled')}
          disabled={busy}
          className="px-2 py-1 rounded-lg text-[11px] font-bold border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      )}

      {/* Calc Points — gameweek contests only */}
      {isGameweek && (
        <button
          onClick={() => void calcPoints()}
          disabled={busy}
          className="px-2 py-1 rounded-lg text-[11px] font-bold border border-[#C9A84C]/40 text-[#C9A84C] hover:bg-[#fef9ee] disabled:opacity-50 transition-colors"
        >
          {busy ? '…' : 'Calc Pts'}
        </button>
      )}
    </div>
  )
}
