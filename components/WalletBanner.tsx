'use client'

import { useSearchParams } from 'next/navigation'

/**
 * Reads ?topup=success|error directly from the live URL.
 * Because this is client-side, it is always in sync with the actual current URL
 * and cannot show stale state from a previous server render.
 */
export default function WalletBanner() {
  const params = useSearchParams()
  const topup = params.get('topup')

  if (topup === 'success') {
    return (
      <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-4 flex items-center gap-3">
        <span className="text-2xl">✅</span>
        <div>
          <p className="text-sm font-black text-green-800">Payment successful!</p>
          <p className="text-xs text-green-600 mt-0.5">Your wallet balance has been updated.</p>
        </div>
      </div>
    )
  }

  if (topup === 'error') {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 flex items-center gap-3">
        <span className="text-2xl">⚠️</span>
        <p className="text-sm text-red-700">Payment was received but we couldn&apos;t update your balance automatically. Please contact support.</p>
      </div>
    )
  }

  return null
}
