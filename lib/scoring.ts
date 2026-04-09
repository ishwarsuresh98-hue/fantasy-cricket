import type { MatchPerformance } from '@/types'

export function computeBasePoints(perf: Partial<MatchPerformance>): number {
  let points = 0

  const runs = perf.runs_scored ?? 0
  const balls = perf.balls_faced ?? 0
  const fours = perf.fours ?? 0
  const sixes = perf.sixes ?? 0
  const wickets = perf.wickets ?? 0
  const catches = perf.catches ?? 0
  const stumpings = perf.stumpings ?? 0
  const runOuts = perf.run_outs ?? 0
  const didNotBat = perf.did_not_bat ?? false

  // Batting
  if (!didNotBat) {
    points += runs                          // 1pt per run
    points += fours                         // +1 per four
    points += sixes * 2                     // +2 per six
    if (runs >= 100) points += 16           // century bonus
    else if (runs >= 50) points += 8        // half-century bonus
    if (runs === 0 && balls > 0) points -= 2 // duck penalty
  }

  // Bowling
  points += wickets * 25                    // 25pt per wicket
  if (wickets >= 5) points += 16           // 5-wicket haul bonus
  else if (wickets >= 4) points += 8       // 4-wicket bonus
  else if (wickets >= 3) points += 4       // 3-wicket bonus

  // Fielding
  points += catches * 8                     // 8pt per catch
  points += stumpings * 12                  // 12pt per stumping
  points += runOuts * 6                     // 6pt per run out

  return points
}

export function applyMultiplier(basePoints: number, isCaptain: boolean, isViceCaptain: boolean): number {
  if (isCaptain) return basePoints * 2
  if (isViceCaptain) return basePoints * 1.5
  return basePoints
}

export const PLAYER_ROLE_LABELS: Record<string, string> = {
  batsman: 'Batsman',
  bowler: 'Bowler',
  all_rounder: 'All-Rounder',
  wicket_keeper: 'Wicket-Keeper',
}
