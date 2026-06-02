'use client'

import { useEffect } from 'react'
import Link          from 'next/link'

export default function ContestsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[ContestsPage] error:', error)
  }, [error])

  return (
    <div className="rounded-2xl bg-red-50 border border-red-200 px-6 py-10 text-center space-y-4">
      <div className="text-4xl">⚠️</div>
      <h2 className="text-lg font-black text-red-800">Couldn&apos;t load contests</h2>
      <p className="text-sm text-red-600 max-w-sm mx-auto">
        There was a problem fetching contest data. This is usually temporary.
      </p>
      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          onClick={reset}
          className="px-4 py-2 rounded-xl bg-red-600 text-[#111111] text-sm font-black hover:bg-red-700 transition-colors"
        >
          Try again
        </button>
        <Link
          href=".."
          className="px-4 py-2 rounded-xl border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-100 transition-colors"
        >
          Go back
        </Link>
      </div>
      {error.digest && (
        <p className="text-[10px] text-red-300 font-mono">{error.digest}</p>
      )}
    </div>
  )
}
