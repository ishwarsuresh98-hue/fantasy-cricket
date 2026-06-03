/**
 * Wise (TransferWise) API helpers.
 *
 * Env vars required:
 *   WISE_API_TOKEN   — API token from Wise dashboard (Settings → API tokens)
 *   WISE_BASE_URL    — optional override, defaults to https://api.wise.com
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
 * Creates a one-time UK bank account recipient.
 * sort_code: "12-34-56" format — dashes are stripped automatically.
 */
export async function createRecipient(
  profileId: number,
  accountHolderName: string,
  sortCode: string,
  accountNumber: string,
): Promise<WiseRecipient> {
  return wisePost<WiseRecipient>('/v1/accounts', {
    currency:          'GBP',
    type:              'sort_code',
    profile:           profileId,
    ownedByCustomer:   false,
    accountHolderName,
    details: {
      legalType:     'PRIVATE',
      sortCode:      sortCode.replace(/-/g, ''),
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
  const profileId   = await getProfileId()
  const quote       = await createQuote(profileId, opts.amountGbp)
  const recipient   = await createRecipient(profileId, opts.accountHolderName, opts.sortCode, opts.accountNumber)
  const transfer    = await createTransfer(profileId, recipient.id, quote.id, opts.reference)
  await fundTransfer(profileId, transfer.id)
  return { transferId: transfer.id, status: transfer.status }
}
