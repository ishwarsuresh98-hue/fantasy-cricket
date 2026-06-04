'use client'

/**
 * WalletTopup — preset + custom amount top-up.
 * Selecting a preset or typing a custom amount, then clicking "Add Funds":
 *   1. POSTs to /api/wallet/topup to get a Stripe client_secret.
 *   2. Shows inline Stripe Elements checkout.
 *   3. On success Stripe redirects back to returnUrl; webhook credits the wallet.
 *
 * The Stripe charge is amount + processing fee.
 * Only the base amount is credited to the wallet.
 */

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements }   from '@stripe/react-stripe-js'
import CheckoutForm   from '@/components/CheckoutForm'
import { calcStripeFee } from '@/lib/stripeFee'
import { cn }         from '@/lib/utils'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '')

const PRESETS = [5, 10, 20, 50] as const
type Preset = (typeof PRESETS)[number]

interface WalletTopupProps {
  returnUrl: string
}

function fmt(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

export default function WalletTopup({ returnUrl }: WalletTopupProps) {
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null)
  const [customAmount,   setCustomAmount]   = useState('')
  const [clientSecret,   setClientSecret]   = useState<string | null>(null)
  const [activeAmount,   setActiveAmount]   = useState<number | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const customNum = customAmount !== '' ? parseFloat(customAmount) : NaN
  const effectiveAmount: number | null = !isNaN(customNum) ? customNum : selectedPreset

  const feeInfo = effectiveAmount && effectiveAmount >= 1 && effectiveAmount <= 500
    ? calcStripeFee(effectiveAmount)
    : null

  function handlePresetClick(amount: Preset) {
    setSelectedPreset(amount)
    setCustomAmount('')
    setError(null)
  }

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedPreset(null)
    setCustomAmount(e.target.value)
    setError(null)
  }

  async function handleAddFunds() {
    if (!effectiveAmount || !feeInfo) return

    if (effectiveAmount < 1 || effectiveAmount > 500) {
      setError('Amount must be between £1 and £500.')
      return
    }
    if (!Number.isFinite(effectiveAmount)) {
      setError('Please enter a valid amount.')
      return
    }

    setError(null)
    setLoading(true)

    try {
      // Send the base amount — the API calculates the fee independently
      const res  = await fetch('/api/wallet/topup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: effectiveAmount }),
      })
      const data = await res.json() as { clientSecret?: string; error?: string }

      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error ?? `Unexpected status ${res.status}`)
      }

      setActiveAmount(effectiveAmount)
      setClientSecret(data.clientSecret)
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to start checkout')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setClientSecret(null)
    setActiveAmount(null)
  }

  // ── Stripe checkout view ───────────────────────────────────────────────────
  if (clientSecret && activeAmount !== null) {
    const { fee, total } = calcStripeFee(activeAmount)
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-black text-gray-900">Top up £{fmt(activeAmount)}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Processing fee £{fee.toFixed(2)} · Total charged £{total.toFixed(2)}
            </p>
          </div>
          <button
            onClick={handleReset}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Change amount
          </button>
        </div>

        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            // currency + amount needed for Apple Pay / Google Pay to show the charge sheet
            currency: 'gbp',
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
            entryFee={activeAmount}
            returnUrl={returnUrl}
            onCancel={handleReset}
          />
        </Elements>
      </div>
    )
  }

  // ── Preset + custom selection view ────────────────────────────────────────
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-gray-600">Select top-up amount</p>

      {/* Preset buttons */}
      <div className="grid grid-cols-4 gap-3">
        {PRESETS.map((amount) => (
          <button
            key={amount}
            onClick={() => handlePresetClick(amount)}
            disabled={loading}
            className={cn(
              'py-4 rounded-2xl font-black text-lg transition-all border-2 disabled:opacity-60',
              selectedPreset === amount
                ? 'border-[#C9A84C] bg-[#C9A84C] text-black'
                : 'border-gray-200 bg-white text-gray-900 hover:border-[#C9A84C] hover:bg-[#fef9ee] hover:text-[#C9A84C]',
            )}
          >
            £{amount}
          </button>
        ))}
      </div>

      {/* Custom amount input */}
      <div className="flex items-center rounded-2xl border-2 overflow-hidden transition-colors focus-within:border-[#C9A84C] border-gray-200 bg-white">
        <span className="pl-4 pr-2 text-lg font-black text-gray-400 select-none">£</span>
        <input
          type="number"
          min={1}
          max={500}
          step="any"
          placeholder="Custom amount"
          value={customAmount}
          onChange={handleCustomChange}
          disabled={loading}
          className="flex-1 py-4 pr-4 text-lg font-black text-gray-900 placeholder:text-gray-300 placeholder:font-normal bg-transparent outline-none disabled:opacity-60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
      <p className="text-xs text-gray-400 -mt-2">Min £1 · Max £500</p>

      {/* Fee breakdown */}
      {feeInfo && (
        <div className="flex justify-between text-xs text-gray-400 px-1 -mt-1">
          <span>Processing fee: <span className="font-semibold text-gray-500">£{feeInfo.fee.toFixed(2)}</span></span>
          <span>Total charged: <span className="font-semibold text-gray-500">£{feeInfo.total.toFixed(2)}</span></span>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {/* Add Funds button */}
      <button
        onClick={handleAddFunds}
        disabled={loading || !effectiveAmount || effectiveAmount < 1 || effectiveAmount > 500}
        className="w-full py-4 rounded-2xl font-black text-base bg-[#C9A84C] text-black hover:bg-[#a8892e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#C9A84C]/20"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin inline-block" />
            Preparing checkout…
          </span>
        ) : feeInfo ? (
          `Pay £${feeInfo.total.toFixed(2)} → add £${fmt(effectiveAmount!)} to wallet`
        ) : (
          'Add Funds'
        )}
      </button>
    </div>
  )
}
