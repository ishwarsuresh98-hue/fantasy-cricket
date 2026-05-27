'use client'

/**
 * Dashboard card that lets users subscribe to / unsubscribe from push notifications.
 * Shows a contextual message for each permission state.
 */
import { usePushSubscription } from '@/lib/usePushSubscription'
import { useState } from 'react'

export default function PushPermissionButton() {
  const { state, subscribe, unsubscribe } = usePushSubscription()
  const [busy, setBusy] = useState(false)

  async function handleToggle() {
    setBusy(true)
    if (state === 'subscribed') {
      await unsubscribe()
    } else {
      await subscribe()
    }
    setBusy(false)
  }

  // Don't render at all while detecting state or if unsupported
  if (state === 'loading')     return null
  if (state === 'unsupported') return null

  if (state === 'denied') {
    return (
      <div className="rounded-xl border border-[#C9A84C]/30 bg-[#fef9ee] px-4 py-3 flex items-start gap-3">
        <span className="text-xl flex-shrink-0">🔕</span>
        <div>
          <p className="text-sm font-semibold text-[#a8892e]">Notifications blocked</p>
          <p className="text-xs text-[#C9A84C] mt-0.5">
            Allow notifications in your browser / device settings to get score alerts.
          </p>
        </div>
      </div>
    )
  }

  if (state === 'subscribed') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl flex-shrink-0">🔔</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-green-800">Push notifications on</p>
            <p className="text-xs text-green-700">You'll receive score alerts and match reminders.</p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={busy}
          className="flex-shrink-0 text-xs font-semibold text-green-700 hover:text-green-900 underline disabled:opacity-50"
        >
          {busy ? 'Turning off…' : 'Turn off'}
        </button>
      </div>
    )
  }

  // state === 'unsubscribed'
  return (
    <button
      onClick={handleToggle}
      disabled={busy}
      className="w-full rounded-xl bg-[#f0f0f0] text-[#0b0b0b] px-4 py-3 flex items-center gap-3 hover:bg-[#fafafa] transition-colors disabled:opacity-60"
    >
      <span className="text-xl flex-shrink-0">{busy ? '⏳' : '🔔'}</span>
      <div className="text-left min-w-0">
        <p className="text-sm font-bold leading-tight">Enable Push Notifications</p>
        <p className="text-xs text-[#0b0b0b]/60 mt-0.5">Get score updates, deadline reminders &amp; new match alerts.</p>
      </div>
    </button>
  )
}
