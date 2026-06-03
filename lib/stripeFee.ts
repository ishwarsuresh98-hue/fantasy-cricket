/**
 * Stripe processing fee for GBP card payments.
 * Formula: 1.5% + £0.20 (standard UK Stripe rate).
 * Returns fee and total, both rounded to 2dp.
 */
export function calcStripeFee(amount: number): { fee: number; total: number } {
  const fee   = Math.round((amount * 0.015 + 0.20) * 100) / 100
  const total = Math.round((amount + fee) * 100) / 100
  return { fee, total }
}
