/** Prize slot returned by calculatePrizeStructure */
export interface PrizeSlot {
  rank_from:  number
  rank_to:    number
  prize_pct:  number   // percentage of the net prize pool
}

/**
 * Calculate prize structure based on contest type.
 *
 * Returns an array of {rank_from, rank_to, prize_pct} objects.
 * prize_pct values sum to ≤ 100 (rounding may leave a tiny remainder).
 *
 * The "net pool" = entryFee × maxEntries × (1 − platformFeePct / 100).
 * This function works in percentages — multiply by netPool to get £ amounts.
 */
export function calculatePrizeStructure(
  _entryFee:      number,
  maxEntries:     number,
  _platformFeePct: number,
  type:           string,
): PrizeSlot[] {
  switch (type) {
    case 'head_to_head':
      return [{ rank_from: 1, rank_to: 1, prize_pct: 85 }]

    case 'small_league': {
      if (maxEntries <= 3) {
        return [{ rank_from: 1, rank_to: 1, prize_pct: 75 }]
      }
      if (maxEntries <= 4) {
        return [
          { rank_from: 1, rank_to: 1, prize_pct: 65 },
          { rank_from: 2, rank_to: 2, prize_pct: 20 },
        ]
      }
      // 5–10 players
      return [
        { rank_from: 1, rank_to: 1, prize_pct: 50 },
        { rank_from: 2, rank_to: 2, prize_pct: 30 },
        { rank_from: 3, rank_to: 3, prize_pct: 20 },
      ]
    }

    case 'mega': {
      // Top 30% win, tiered prizes
      const winners = Math.max(1, Math.floor(maxEntries * 0.3))
      if (winners === 1) {
        return [{ rank_from: 1, rank_to: 1, prize_pct: 75 }]
      }
      const slots: PrizeSlot[] = []
      // 1st: 40%, 2nd: 25%, 3rd: 15%, then split remaining evenly
      const tiers = [40, 25, 15]
      let used = 0
      for (let i = 0; i < Math.min(tiers.length, winners); i++) {
        slots.push({ rank_from: i + 1, rank_to: i + 1, prize_pct: tiers[i] })
        used += tiers[i]
      }
      if (winners > tiers.length) {
        const remaining  = 75 - used
        const restWinners = winners - tiers.length
        const perWinner   = Math.floor(remaining / restWinners)
        slots.push({
          rank_from: tiers.length + 1,
          rank_to:   winners,
          prize_pct: perWinner,
        })
      }
      return slots
    }

    case 'winner_takes_all':
      return [{ rank_from: 1, rank_to: 1, prize_pct: 85 }]

    case 'practice':
      return []   // no prize

    default:
      return [{ rank_from: 1, rank_to: 1, prize_pct: 75 }]
  }
}

/** Calculate the net prize pool in pounds */
export function netPrizePool(
  entryFee:      number,
  totalEntries:  number,
  platformFeePct: number,
): number {
  return entryFee * totalEntries * (1 - platformFeePct / 100)
}

/** Compute the prize amount in pounds for a given slot */
export function prizeForSlot(slot: PrizeSlot, pool: number): number {
  return Math.round((pool * slot.prize_pct / 100) * 100) / 100
}

/** Human-readable prize description, e.g. "1st: £8.50 • 2nd: £5.10" */
export function prizeSummary(
  slots:          PrizeSlot[],
  entryFee:       number,
  totalEntries:   number,
  platformFeePct: number,
): string {
  if (slots.length === 0) return 'No prizes'
  const pool = netPrizePool(entryFee, totalEntries, platformFeePct)
  return slots
    .map((s) => {
      const amount = prizeForSlot(s, pool)
      const rankLabel = s.rank_from === s.rank_to
        ? ordinal(s.rank_from)
        : `${ordinal(s.rank_from)}–${ordinal(s.rank_to)}`
      return `${rankLabel}: £${amount.toFixed(2)}`
    })
    .join(' • ')
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}
