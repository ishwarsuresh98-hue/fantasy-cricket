'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  balance: number
  slug: string
}

export default function WithdrawForm({ balance, slug }: Props) {
  const [amount,        setAmount]        = useState('')
  const [accountName,   setAccountName]   = useState('')
  const [sortCode,      setSortCode]      = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [success,       setSuccess]       = useState(false)

  function formatSortCode(value: string) {
    // Strip non-digits, then insert dashes at positions 2 and 4
    const digits = value.replace(/\D/g, '').slice(0, 6)
    if (digits.length <= 2) return digits
    if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`
    return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amt = parseFloat(amount)
    if (isNaN(amt) || amt < 5) { setError('Minimum withdrawal is £5.'); return }
    if (amt > balance)           { setError(`Maximum is your balance of £${balance.toFixed(2)}.`); return }
    if (!accountName.trim())     { setError('Account holder name is required.'); return }
    if (!/^\d{2}-\d{2}-\d{2}$/.test(sortCode)) { setError('Sort code must be in XX-XX-XX format.'); return }
    if (!/^\d{8}$/.test(accountNumber))         { setError('Account number must be 8 digits.'); return }

    setLoading(true)
    try {
      const res  = await fetch('/api/wallet/withdraw', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: amt, account_name: accountName.trim(), sort_code: sortCode, account_number: accountNumber }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Request failed')
      setSuccess(true)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-6 flex flex-col items-center gap-3 text-center">
        <span className="text-4xl">✅</span>
        <p className="text-base font-black text-green-800">Withdrawal requested</p>
        <p className="text-sm text-green-600">Usually processed within 2 business days. Your balance has been updated.</p>
      </div>
    )
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 placeholder:text-gray-300 focus:border-[#C9A84C] focus:outline-none focus:ring-1 focus:ring-[#C9A84C] disabled:opacity-50'
  const labelClass = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Amount */}
      <div>
        <label className={labelClass}>Amount</label>
        <div className="flex items-center rounded-xl border border-gray-200 bg-white focus-within:border-[#C9A84C] focus-within:ring-1 focus-within:ring-[#C9A84C] overflow-hidden">
          <span className="pl-4 pr-2 text-base font-black text-gray-400 select-none">£</span>
          <input
            type="number"
            min={5}
            max={balance}
            step="any"
            placeholder={`5.00 – ${balance.toFixed(2)}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={loading}
            className="flex-1 py-3 pr-4 text-base font-semibold text-gray-900 placeholder:text-gray-300 placeholder:font-normal bg-transparent outline-none disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">Min £5 · Max £{balance.toFixed(2)}</p>
      </div>

      {/* Account holder name */}
      <div>
        <label className={labelClass}>Account holder name</label>
        <input
          type="text"
          placeholder="Full name on bank account"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          disabled={loading}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Sort code */}
        <div>
          <label className={labelClass}>Sort code</label>
          <input
            type="text"
            placeholder="XX-XX-XX"
            value={sortCode}
            onChange={(e) => setSortCode(formatSortCode(e.target.value))}
            disabled={loading}
            maxLength={8}
            className={inputClass}
          />
        </div>
        {/* Account number */}
        <div>
          <label className={labelClass}>Account number</label>
          <input
            type="text"
            placeholder="12345678"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 8))}
            disabled={loading}
            maxLength={8}
            className={inputClass}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !amount || parseFloat(amount) < 5 || parseFloat(amount) > balance}
        className={cn(
          'w-full py-4 rounded-2xl font-black text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
          'bg-[#0b0b0b] text-white hover:bg-[#333] shadow-sm',
        )}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin inline-block" />
            Submitting…
          </span>
        ) : amount && parseFloat(amount) >= 5 ? (
          `Request withdrawal of £${parseFloat(amount) % 1 === 0 ? parseFloat(amount) : parseFloat(amount).toFixed(2)}`
        ) : (
          'Request Withdrawal'
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Funds are held until your withdrawal is reviewed. Usually processed within 2 business days.
      </p>
    </form>
  )
}
