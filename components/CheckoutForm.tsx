'use client'

import { useState } from 'react'
import {
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'

interface CheckoutFormProps {
  /** Entry fee in pounds (e.g. 5.00). Shown in the submit button label. */
  entryFee: number
  /** Called after Stripe confirms the payment and redirects back. */
  returnUrl: string
  /** Called when the user clicks Cancel. */
  onCancel?: () => void
}

/**
 * Stripe-powered payment form.
 *
 * Must be rendered inside a Stripe <Elements> provider that has been
 * initialised with a `clientSecret`. Use <ContestPaymentWrapper> to set
 * that up automatically.
 *
 * On submit it calls `stripe.confirmPayment`, which redirects the browser
 * to `returnUrl` on success (Stripe appends ?payment_intent=… to the URL).
 */
export default function CheckoutForm({ entryFee, returnUrl, onCancel }: CheckoutFormProps) {
  const stripe   = useStripe()
  const elements = useElements()

  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    setError(null)

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    })

    // confirmPayment only resolves with an error when it fails; on success the
    // browser is redirected before we get here.
    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Stripe's hosted Payment Element — renders card / wallet / BNPL as appropriate */}
      <div className="rounded-xl border border-[#2a2a2a] p-4 bg-[#111111]">
        <PaymentElement
          options={{
            layout: 'tabs',
          }}
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          className="flex-1 bg-[#111111] hover:bg-[#0a0a0a] text-white font-bold"
          disabled={!stripe || !elements || loading}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing…
            </span>
          ) : (
            `Pay £${entryFee.toFixed(2)}`
          )}
        </Button>
      </div>

      <p className="text-center text-xs text-gray-400">
        Secured by{' '}
        <span className="font-semibold text-[#635BFF]">Stripe</span>
        {' '}— your card details are never stored on our servers.
      </p>
    </form>
  )
}
