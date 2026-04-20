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

/**
 * The lock window for a matchday:
 *   lockStart = 30 min before the EARLIEST match (= the deadline)
 *   lockEnd   = 30 min after  the LATEST  match starts
 *
 * Team is locked only while now is between lockStart and lockEnd.
 * Before lockStart: free editing (changes not yet counted as transfers).
 * After  lockEnd:   free editing again (next gameweek prep; that day's transfers already confirmed).
 */
export function computeMatchDayLockWindow(
  upcomingMatches: Pick<Match, 'match_date'>[]
): { lockStart: Date; lockEnd: Date } | null {
  if (!upcomingMatches.length) return null

  const sorted = [...upcomingMatches].sort(
    (a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime()
  )

  const nextDayStr = new Date(sorted[0].match_date).toISOString().slice(0, 10)
  const sameDayMatches = sorted.filter(
    (m) => new Date(m.match_date).toISOString().slice(0, 10) === nextDayStr
  )

  const timestamps = sameDayMatches.map((m) => new Date(m.match_date).getTime())
  const earliestMs = Math.min(...timestamps)
  const latestMs   = Math.max(...timestamps)

  return {
    lockStart: new Date(earliestMs - 30 * 60 * 1000),
    lockEnd:   new Date(latestMs   + 30 * 60 * 1000),
  }
}

/**
 * For a specific match, compute the full lock window using all season matches.
 * Used server-side when processing transfer logs to determine if a matchday is confirmed.
 */
export function getMatchDayLockWindow(
  match: Pick<Match, 'match_date'>,
  allMatches: Pick<Match, 'match_date'>[]
): { lockStart: Date; lockEnd: Date } | null {
  const matchDayStr = new Date(match.match_date).toISOString().slice(0, 10)
  const sameDayMatches = allMatches.filter(
    (m) => new Date(m.match_date).toISOString().slice(0, 10) === matchDayStr
  )
  if (!sameDayMatches.length) return null
  const timestamps = sameDayMatches.map((m) => new Date(m.match_date).getTime())
  return {
    lockStart: new Date(Math.min(...timestamps) - 30 * 60 * 1000),
    lockEnd:   new Date(Math.max(...timestamps) + 30 * 60 * 1000),
  }
}

/**
 * For a specific match, compute only the deadline (lockStart) using all season matches.
 * Kept for transfer-log confirmation checks.
 */
export function getMatchDayDeadline(
  match: Pick<Match, 'match_date'>,
  allMatches: Pick<Match, 'match_date'>[]
): Date | null {
  return getMatchDayLockWindow(match, allMatches)?.lockStart ?? null
}
