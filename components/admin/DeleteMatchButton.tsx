'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface Props {
  matchId: string
  matchLabel: string   // e.g. "Match 3 vs Banbury CC"
}

export default function DeleteMatchButton({ matchId, matchLabel }: Props) {
  const router   = useRouter()
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleConfirm() {
    setLoading(true)
    setError(null)

    const res  = await fetch('/api/admin/delete-match', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ matchId }),
    })
    const data = await res.json()

    if (!res.ok || data.error) {
      setError(data.error ?? 'Unknown error')
      setLoading(false)
      return
    }

    setOpen(false)
    router.refresh()
  }

  return (
    <>
      {/* Trigger */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setOpen(true); setError(null) }}
        className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
      >
        Delete
      </Button>

      {/* Confirmation dialog */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-match-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !loading && setOpen(false)}
          />

          {/* Panel */}
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl mt-0.5">⚠️</span>
              <div>
                <h2 id="delete-match-title" className="font-semibold text-gray-900">
                  Delete {matchLabel}?
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This will permanently delete the match and all player stats recorded
                  for it. Fantasy points from this match will also be removed.
                  This action cannot be undone.
                </p>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={loading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {loading ? 'Deleting…' : 'Yes, delete match'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
