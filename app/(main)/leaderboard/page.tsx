import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

// ── Gameweek helpers ──────────────────────────────────────────────────────────

/** UTC date string (YYYY-MM-DD) for grouping matches into gameweeks. */
function matchDay(dateStr: string): string {
  return new Date(dateStr).toISOString().slice(0, 10)
}

interface Gameweek {
  gw: number           // 1-based gameweek number
  dateStr: string      // YYYY-MM-DD
  label: string        // human-readable, e.g. "16 May 2026"
  matchIds: string[]
}

function buildGameweeks(
  matches: { id: string; match_date: string }[]
): Gameweek[] {
  // Collect unique dates in chronological order
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!season) {
    return (
      <div className="text-center py-24">
        <div className="text-5xl mb-4">🏆</div>
        <h2 className="text-2xl font-bold text-gray-800">No Active Season</h2>
        <p className="text-muted-foreground mt-2">The leaderboard will appear once a season is active.</p>
      </div>
    )
  }

  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('*, profiles(display_name)')
    .eq('season_id', season.id)
    .order('total_points', { ascending: false })

  // All completed matches — needed for gameweek grouping
  const { data: completedMatches } = await supabase
    .from('matches')
    .select('id, match_number, match_date')
    .eq('season_id', season.id)
    .eq('status', 'completed')
    .order('match_date', { ascending: true })

  const gameweeks = buildGameweeks(completedMatches ?? [])
  const completedMatchIds = (completedMatches ?? []).map((m) => m.id)

  // All selections for completed matches (points only — no player join needed)
  const { data: allSelections } = completedMatchIds.length > 0
    ? await supabase
        .from('fantasy_selections')
        .select('fantasy_team_id, match_id, points_earned')
        .in('match_id', completedMatchIds)
    : { data: [] }

  // Build lookup: teamId → matchId → total points for that match
  const pointsByTeamMatch: Record<string, Record<string, number>> = {}
  for (const sel of allSelections ?? []) {
    if (!pointsByTeamMatch[sel.fantasy_team_id])
      pointsByTeamMatch[sel.fantasy_team_id] = {}
    pointsByTeamMatch[sel.fantasy_team_id][sel.match_id] =
      (pointsByTeamMatch[sel.fantasy_team_id][sel.match_id] ?? 0) + sel.points_earned
  }

  // Compute per-team, per-gameweek totals by summing across all matches in the GW
  function gwPoints(teamId: string, gw: Gameweek): number {
    const teamMatches = pointsByTeamMatch[teamId] ?? {}
    return gw.matchIds.reduce((sum, mid) => sum + (teamMatches[mid] ?? 0), 0)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#262162]">Leaderboard</h1>
        <p className="text-muted-foreground mt-1">{season.name}</p>
      </div>

      {(!teams || teams.length === 0) ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-muted-foreground">No teams have been created yet. Be the first!</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="border-b bg-[#262162] rounded-t-xl">
            <CardTitle className="text-white">Season Rankings — {season.name}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-6 py-3 sticky left-0 bg-gray-50">
                      Rank
                    </th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-6 py-3 sticky left-12 bg-gray-50 min-w-[160px]">
                      Team
                    </th>
                    {gameweeks.map((gw) => (
                      <th
                        key={gw.dateStr}
                        className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3 min-w-[56px]"
                        title={gw.label}
                      >
                        GW{gw.gw}
                      </th>
                    ))}
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-6 py-3">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {teams.map((team, idx) => {
                    const isMe = team.user_id === user!.id
                    const rank = idx + 1
                    return (
                      <tr
                        key={team.id}
                        className={`transition-colors ${isMe ? 'bg-[#eeedf8]' : 'hover:bg-gray-50'}`}
                      >
                        {/* Rank */}
                        <td className={`px-6 py-4 sticky left-0 ${isMe ? 'bg-[#eeedf8]' : 'bg-white group-hover:bg-gray-50'}`}>
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                            rank === 1 ? 'bg-[#fbf927] text-[#262162]' :
                            rank === 2 ? 'bg-gray-200 text-gray-700'   :
                            rank === 3 ? 'bg-orange-100 text-orange-700' :
                            'text-muted-foreground'
                          }`}>
                            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                          </span>
                        </td>

                        {/* Team */}
                        <td className={`px-6 py-4 sticky left-12 ${isMe ? 'bg-[#eeedf8]' : 'bg-white'}`}>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs bg-[#262162] text-[#fbf927] font-bold">
                                {(team.profiles as { display_name: string })?.display_name?.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm flex items-center gap-1.5">
                                {team.team_name}
                                {isMe && (
                                  <Badge className="text-xs bg-[#fbf927] text-[#262162] hover:bg-[#fbf927] font-semibold">
                                    You
                                  </Badge>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {(team.profiles as { display_name: string })?.display_name}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Gameweek columns */}
                        {gameweeks.map((gw) => {
                          const pts = gwPoints(team.id, gw)
                          return (
                            <td key={gw.dateStr} className="px-3 py-4 text-center text-sm">
                              {pts > 0
                                ? <span className="font-medium">{pts.toFixed(1)}</span>
                                : <span className="text-muted-foreground">—</span>
                              }
                            </td>
                          )
                        })}

                        {/* Total */}
                        <td className="px-6 py-4 text-right">
                          <span className="text-lg font-bold text-[#262162]">
                            {team.total_points.toFixed(1)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Gameweek date key */}
            {gameweeks.length > 0 && (
              <div className="border-t px-6 py-3 flex flex-wrap gap-x-4 gap-y-1">
                {gameweeks.map((gw) => (
                  <span key={gw.dateStr} className="text-xs text-muted-foreground">
                    <span className="font-medium text-gray-700">GW{gw.gw}</span> = {gw.label}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
