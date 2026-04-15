import type { Match } from '@/types'

/**
 * For the next upcoming match day, the deadline is 30 minutes before
 * the earliest match start time on that day.
 *
 * "Match day" is grouped by UTC date (YYYY-MM-DD). Matches on the same
 * calendar day share one deadline.
 */
export function computeMatchDayDeadline(upcomingMatches: Pick<Match, 'match_date'>[]): Date | null {
  if (!upcomingMatches.length) return null

  const sorted = [...upcomingMatches].sort(
    (a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime()
  )

  // Identify the next match day (UTC date of the earliest upcoming match)
  const nextDayStr = new Date(sorted[0].match_date).toISOString().slice(0, 10)

  // Collect all matches on that same day
  const sameDayMatches = sorted.filter(
    (m) => new Date(m.match_date).toISOString().slice(0, 10) === nextDayStr
  )

  // Earliest kick-off on that day
  const earliestMs = Math.min(...sameDayMatches.map((m) => new Date(m.match_date).getTime()))

  // Deadline = 30 minutes before the earliest match
  return new Date(earliestMs - 30 * 60 * 1000)
}

export function isDeadlinePassed(deadline: Date | null): boolean {
  if (!deadline) return false
  return Date.now() > deadline.getTime()
}
