/** UTC date string (YYYY-MM-DD) used to group matches by calendar day. */
function matchDay(dateStr: string): string {
  return new Date(dateStr).toISOString().slice(0, 10)
}

export interface Gameweek {
  gw: number        // 1-based gameweek number
  dateStr: string   // YYYY-MM-DD (UTC)
  label: string     // human-readable, e.g. "16 May 2026"
  matchIds: string[]
}

/**
 * Groups an array of matches by calendar date (UTC) into Gameweeks.
 * All matches on the same date form one gameweek.
 * Input must be sorted ascending by match_date for correct GW numbering.
 */
export function buildGameweeks(
  matches: { id: string; match_date: string }[]
): Gameweek[] {
  const dateSet = new Map<string, string[]>()   // dateStr → matchIds[]

  for (const m of matches) {
    const d = matchDay(m.match_date)
    if (!dateSet.has(d)) dateSet.set(d, [])
    dateSet.get(d)!.push(m.id)
  }

  const sortedDates = [...dateSet.keys()].sort()

  return sortedDates.map((d, i) => ({
    gw:       i + 1,
    dateStr:  d,
    label:    new Date(d).toLocaleDateString('en-AU', {
                day: 'numeric', month: 'short', year: 'numeric',
              }),
    matchIds: dateSet.get(d)!,
  }))
}
