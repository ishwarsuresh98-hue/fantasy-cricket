/**
 * Wise (TransferWise) API helpers.
 *
 * Env vars required:
 *   WISE_API_TOKEN            — API token from Wise dashboard (Settings → API tokens)
 *   WISE_BASE_URL             — optional override, defaults to https://api.wise.com
 *   WISE_OWN_ACCOUNT_NUMBER   — 8-digit account number for the platform's own Wise account
 *   WISE_OWN_SORT_CODE        — sort code (XX-XX-XX) for the platform's own Wise account
 *   WISE_OWN_ACCOUNT_NAME     — account holder name for the platform's own Wise account
 *   WISE_PLATFORM_FEE_PCT     — optional platform fee percentage (0-100, default 0)
 *
 * Sandbox: use https://api.sandbox.transferwise.tech and a sandbox token.
 */

const BASE_URL = process.env.WISE_BASE_URL ?? 'https://api.wise.com'

function wiseToken(): string {
  const token = process.env.WISE_API_TOKEN
  if (!token) throw new Error('WISE_API_TOKEN environment variable is not set.')
  return token
}

async function wiseGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${wiseToken()}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Wise API ${path} returned ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

async function wisePost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${wiseToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Wise API POST ${path} returned ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Profile ───────────────────────────────────────────────────────────────────

export interface WiseProfile {
  id: number
  type: 'personal' | 'business'
  details: { firstName?: string; name?: string }
}

/**
 * Returns all profiles associated with the API token.
 * Typically one personal + one business.
 */
export async function getProfiles(): Promise<WiseProfile[]> {
  return wiseGet<WiseProfile[]>('/v1/profiles')
}

/**
 * Returns the first business profile ID, falling back to personal.
 * Cached for the duration of the Node process (module-level singleton).
 */
let _cachedProfileId: number | null = null

export async function getProfileId(): Promise<number> {
  if (_cachedProfileId !== null) return _cachedProfileId

  const profiles = await getProfiles()
  const business = profiles.find((p) => p.type === 'business')
  const chosen   = business ?? profiles[0]
  if (!chosen) throw new Error('No Wise profiles found for this API token.')

  _cachedProfileId = chosen.id
  return chosen.id
}

// ── Quote ─────────────────────────────────────────────────────────────────────

export interface WiseQuote {
  id: string
  sourceCurrency: string
  targetCurrency: string
  sourceAmount: number
  targetAmount: number
}

export async function createQuote(profileId: number, amountGbp: number): Promise<WiseQuote> {
  return wisePost<WiseQuote>(`/v3/profiles/${profileId}/quotes`, {
    sourceCurrency: 'GBP',
    targetCurrency: 'GBP',
    sourceAmount:   amountGbp,
    targetAmount:   null,
    payOut:         'BANK_TRANSFER',
  })
}

// ── Recipient ─────────────────────────────────────────────────────────────────

export interface WiseRecipient {
  id: number
}

/**
 * Normalises a sort code to XX-XX-XX format regardless of input format.
 * Accepts "123456", "12-34-56", "12 34 56", etc.
 */
function normaliseSortCode(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 6) throw new Error(`Invalid sort code "${raw}" — expected 6 digits, got ${digits.length}`)
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`
}

/**
 * Creates a one-time UK bank account recipient.
 * sort_code: accepts any format ("XX-XX-XX", "XXXXXX", "XX XX XX") —
 * always sent to Wise as XX-XX-XX with dashes.
 */
export async function createRecipient(
  profileId: number,
  accountHolderName: string,
  sortCode: string,
  accountNumber: string,
): Promise<WiseRecipient> {
  const formattedSortCode = normaliseSortCode(sortCode)
  return wisePost<WiseRecipient>('/v1/accounts', {
    currency:          'GBP',
    type:              'sort_code',
    profile:           profileId,
    ownedByCustomer:   false,
    accountHolderName,
    details: {
      legalType:     'PRIVATE',
      sortCode:      formattedSortCode,
      accountNumber,
    },
  })
}

// ── Transfer ──────────────────────────────────────────────────────────────────

export interface WiseTransfer {
  id: number
  status: string
}

export async function createTransfer(
  profileId: number,
  targetAccountId: number,
  quoteUuid: string,
  reference: string,
): Promise<WiseTransfer> {
  return wisePost<WiseTransfer>('/v1/transfers', {
    targetAccount:          targetAccountId,
    quoteUuid,
    customerTransactionId:  reference,
    details: { reference },
  })
}

export async function fundTransfer(profileId: number, transferId: number): Promise<void> {
  await wisePost(`/v3/profiles/${profileId}/transfers/${transferId}/payments`, {
    type: 'BALANCE',
  })
}

// ── High-level helper: full payout flow ───────────────────────────────────────

export interface WisePayoutResult {
  transferId: number
  status: string
}

/**
 * End-to-end Wise payout:
 *   1. Resolve profile ID
 *   2. Create quote
 *   3. Create recipient
 *   4. Create transfer
 *   5. Fund transfer from Wise balance
 *
 * Throws on any failure — caller should catch and fall back to manual_required.
 */
export async function sendWisePayout(opts: {
  amountGbp: number
  accountHolderName: string
  sortCode: string
  accountNumber: string
  reference: string
}): Promise<WisePayoutResult> {
  console.log(`[wise/sendWisePayout] START ref=${opts.reference} amount=£${opts.amountGbp}`)

  console.log(`[wise/sendWisePayout] Step 1: getProfileId`)
  const profileId = await getProfileId()
  console.log(`[wise/sendWisePayout] Step 1 OK: profileId=${profileId}`)

  console.log(`[wise/sendWisePayout] Step 2: createQuote profileId=${profileId} amount=£${opts.amountGbp}`)
  const quote = await createQuote(profileId, opts.amountGbp)
  console.log(`[wise/sendWisePayout] Step 2 OK: quoteId=${quote.id} source=${quote.sourceAmount} target=${quote.targetAmount}`)

  console.log(`[wise/sendWisePayout] Step 3: createRecipient accountName="${opts.accountHolderName}" sortCode(raw)=${opts.sortCode} sortCode(formatted)=${normaliseSortCode(opts.sortCode)} accountNumber=${opts.accountNumber.slice(0, 4)}****`)
  const recipient = await createRecipient(profileId, opts.accountHolderName, opts.sortCode, opts.accountNumber)
  console.log(`[wise/sendWisePayout] Step 3 OK: recipientId=${recipient.id}`)

  console.log(`[wise/sendWisePayout] Step 4: createTransfer recipientId=${recipient.id} quoteId=${quote.id}`)
  const transfer = await createTransfer(profileId, recipient.id, quote.id, opts.reference)
  console.log(`[wise/sendWisePayout] Step 4 OK: transferId=${transfer.id} status=${transfer.status}`)

  console.log(`[wise/sendWisePayout] Step 5: fundTransfer transferId=${transfer.id}`)
  await fundTransfer(profileId, transfer.id)
  console.log(`[wise/sendWisePayout] Step 5 OK: transfer funded`)

  console.log(`[wise/sendWisePayout] DONE transferId=${transfer.id} status=${transfer.status}`)
  return { transferId: transfer.id, status: transfer.status }
}

// ── Revenue sweep: Stripe → platform Wise account ─────────────────────────────

/**
 * Transfers net Stripe revenue to the platform's own Wise account.
 *
 * Call this after each successful wallet top-up so that Stripe's held
 * balance is swept to Wise, which then has funds available to pay out
 * user withdrawal requests.
 *
 * Env vars used:
 *   WISE_OWN_ACCOUNT_NUMBER  — platform's own bank account number
 *   WISE_OWN_SORT_CODE       — platform's own sort code (XX-XX-XX)
 *   WISE_OWN_ACCOUNT_NAME    — platform's own account holder name
 *   WISE_PLATFORM_FEE_PCT    — optional fee % to retain (default 0)
 *
 * @param grossAmountGbp  The full payment amount received from the user (£)
 * @param reference       Idempotency/audit reference (e.g. Stripe PI id)
 * @returns The Wise transfer ID and status, or null if not configured / skipped
 */
export async function transferStripeRevenueToWise(
  grossAmountGbp: number,
  reference: string,
): Promise<WisePayoutResult | null> {
  const accountNumber = process.env.WISE_OWN_ACCOUNT_NUMBER
  const sortCode      = process.env.WISE_OWN_SORT_CODE
  const accountName   = process.env.WISE_OWN_ACCOUNT_NAME ?? 'The XI Fantasy Cricket'

  if (!accountNumber || !sortCode) {
    console.warn('[wise] transferStripeRevenueToWise: WISE_OWN_ACCOUNT_NUMBER or WISE_OWN_SORT_CODE not set — skipping sweep')
    return null
  }

  if (!process.env.WISE_API_TOKEN) {
    console.warn('[wise] transferStripeRevenueToWise: WISE_API_TOKEN not set — skipping sweep')
    return null
  }

  // Deduct platform fee before sweeping (default 0%)
  const feePct  = Math.min(100, Math.max(0, Number(process.env.WISE_PLATFORM_FEE_PCT ?? 0)))
  const netAmount = Math.round(grossAmountGbp * (1 - feePct / 100) * 100) / 100

  if (netAmount <= 0) {
    console.warn(`[wise] transferStripeRevenueToWise: net amount £${netAmount} is zero after fee — skipping`)
    return null
  }

  console.log(`[wise] Sweeping £${netAmount} (gross £${grossAmountGbp}, fee ${feePct}%) to platform Wise account (ref: ${reference})`)

  const result = await sendWisePayout({
    amountGbp:         netAmount,
    accountHolderName: accountName,
    sortCode,
    accountNumber,
    reference:         `stripe-sweep-${reference}`,
  })

  console.log(`[wise] Sweep transfer created: id=${result.transferId} status=${result.status}`)
  return result
}
