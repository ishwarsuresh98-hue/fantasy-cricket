'use client'

import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import CheckoutForm from '@/components/CheckoutForm'

// Initialise Stripe once outside the component so the object is not
// recreated on every render.
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
)

interface ContestPaymentWrapperProps {
  contestId:    string
  fantasyTeamId: string
  /** Entry fee in pounds, shown in the button label. */
  entryFee:     number
  /** URL to redirect to after successful payment (Stripe appends ?payment_intent=…). */
  returnUrl:    string
  /** Called when the user cancels. */
  onCancel?:    () => void
}

/**
 * Fetches a Stripe client_secret from /api/create-payment-intent, then
 * renders a Stripe <Elements> provider wrapping <CheckoutForm>.
 *
 * Env var required (client-side):
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — publishable key from Stripe dashboard
 */
export default function ContestPaymentWrapper({
  contestId,
  fantasyTeamId,
  entryFee,
  returnUrl,
  onCancel,
}: ContestPaymentWrapperProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    let cancelled = false

    async function createIntent() {
      try {
        const res = await fetch('/api/create-payment-intent', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ contest_id: contestId, fantasy_team_id: fantasyTeamId }),
        })

        const data: { clientSecret?: string; error?: string } = await res.json()

        if (!res.ok || !data.clientSecret) {
          throw new Error(data.error ?? `Unexpected status ${res.status}`)
        }

        if (!cancelled) setClientSecret(data.clientSecret)
      } catch (e: unknown) {
        if (!cancelled) setFetchError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    createIntent()
    return () => { cancelled = true }
  }, [contestId, fantasyTeamId])

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <div className="w-8 h-8 border-2 border-[#262162]/20 border-t-[#262162] rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Preparing secure checkout…</p>
      </div>
    )
  }

  // ── Error fetching intent ─────────────────────────────────────────────────
  if (fetchError || !clientSecret) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-6 text-center space-y-3">
        <p className="text-sm font-semibold text-red-700">
          {fetchError ?? 'Could not initialise payment.'}
        </p>
        <div className="flex justify-center gap-3">
          {onCancel && (
            <button
              onClick={onCancel}
              className="text-sm text-gray-500 underline hover:text-gray-700"
            >
              Go back
            </button>
          )}
          <button
            onClick={() => {
              setFetchError(null)
              setLoading(true)
              setClientSecret(null)
            }}
            className="text-sm text-[#262162] font-semibold underline hover:text-[#1a1648]"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Stripe Elements provider ──────────────────────────────────────────────
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary:       '#262162',
            colorBackground:    '#ffffff',
            colorText:          '#1a1a2e',
            colorDanger:        '#b5211e',
            fontFamily:         'ui-sans-serif, system-ui, sans-serif',
            spacingUnit:        '4px',
            borderRadius:       '8px',
          },
        },
      }}
    >
      <CheckoutForm
        entryFee={entryFee}
        returnUrl={returnUrl}
        onCancel={onCancel}
      />
    </Elements>
  )
}
