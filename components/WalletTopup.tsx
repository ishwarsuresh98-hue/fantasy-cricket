'use client'

/**
 * WalletTopup — renders preset top-up amounts (£5, £10, £20, £50).
 * Clicking a preset:
 *   1. POSTs to /api/wallet/topup to get a Stripe client_secret.
 *   2. Shows inline Stripe Elements checkout.
 *   3. On success Stripe redirects back to returnUrl; webhook credits the wallet.
 */

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements }   from '@stripe/react-stripe-js'
import CheckoutForm   from '@/components/CheckoutForm'
import { cn }         from '@/lib/utils'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '')

const PRESETS = [5, 10, 20, 50] as const
type Preset = (typeof PRESETS)[number]

interface WalletTopupProps {
  /** Absolute URL Stripe redirects to after payment (appends ?payment_intent=…) */
  returnUrl: string
}

export default function WalletTopup({ returnUrl }: WalletTopupProps) {
  const [selected,     setSelected]     = useState<Preset | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  async function startTopup(amount: Preset) {
    setSelected(amount)
    setClientSecret(null)
    setError(null)
    setLoading(true)

    try {
      const res  = await fetch('/api/wallet/topup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount }),
      })
      const data = await res.json() as { clientSecret?: string; error?: string }

      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error ?? `Unexpected status ${res.status}`)
      }

      setClientSecret(data.clientSecret)
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to start checkout')
      setSelected(null)
    } finally {
      setLoading(false)
    }
  }

  // ── Stripe checkout view ───────────────────────────────────────────────────
  if (clientSecret && selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-gray-900">Top up £{selected}</h3>
          <button
            onClick={() => { setClientSecret(null); setSelected(null) }}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Change amount
          </button>
        </div>

        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: 'stripe',
              variables: {
                colorPrimary:    '#C9A84C',
                colorBackground: '#ffffff',
                colorText:       '#0b0b0b',
                colorDanger:     '#b5211e',
                fontFamily:      'ui-sans-serif, system-ui, sans-serif',
                spacingUnit:     '4px',
                borderRadius:    '8px',
              },
            },
          }}
        >
          <CheckoutForm
            entryFee={selected}
            returnUrl={returnUrl}
            onCancel={() => { setClientSecret(null); setSelected(null) }}
          />
        </Elements>
      </div>
    )
  }

  // ── Preset selection view ──────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-gray-600">Select top-up amount</p>
      <div className="grid grid-cols-4 gap-3">
        {PRESETS.map((amount) => (
          <button
            key={amount}
            onClick={() => startTopup(amount)}
            disabled={loading}
            className={cn(
              'py-4 rounded-2xl font-black text-lg transition-all border-2 disabled:opacity-60',
              selected === amount && loading
                ? 'border-[#C9A84C] bg-[#C9A84C] text-black scale-95'
                : 'border-gray-200 bg-white text-gray-900 hover:border-[#C9A84C] hover:bg-[#fef9ee] hover:text-[#C9A84C]',
            )}
          >
            £{amount}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-2">
          <div className="w-4 h-4 border-2 border-[#C9A84C]/20 border-t-[#C9A84C] rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Preparing checkout…</p>
        </div>
      )}
    </div>
  )
}
