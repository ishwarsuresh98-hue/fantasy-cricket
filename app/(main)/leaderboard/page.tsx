import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

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

  const { data: matches } = await supabase
    .from('matches')
    .select('id, match_number, status')
    .eq('season_id', season.id)
    .eq('status', 'completed')

  const completedMatchIds = (matches ?? []).map((m: { id: string }) => m.id)

  const { data: allSelections } = completedMatchIds.length > 0
    ? await supabase
        .from('fantasy_selections')
        .select('fantasy_team_id, match_id, points_earned')
        .in('match_id', completedMatchIds)
    : { data: [] }

  const selectionsByTeam: Record<string, Record<string, number>> = {}
  for (const sel of allSelections ?? []) {
    if (!selectionsByTeam[sel.fantasy_team_id]) selectionsByTeam[sel.fantasy_team_id] = {}
    selectionsByTeam[sel.fantasy_team_id][sel.match_id] =
      (selectionsByTeam[sel.fantasy_team_id][sel.match_id] ?? 0) + sel.points_earned
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
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-6 py-3">Rank</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-6 py-3">Team</th>
                    {(matches ?? []).map((m: { id: string; match_number: number }) => (
                      <th key={m.id} className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">
                        M{m.match_number}
                      </th>
                    ))}
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-6 py-3">Total</th>
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
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                            rank === 1 ? 'bg-[#fbf927] text-[#262162]' :
                            rank === 2 ? 'bg-gray-200 text-gray-700' :
                            rank === 3 ? 'bg-orange-100 text-orange-700' :
                            'text-muted-foreground'
                          }`}>
                            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                          </span>
                        </td>
                        <td className="px-6 py-4">
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
                                  <Badge className="text-xs bg-[#fbf927] text-[#262162] hover:bg-[#fbf927] font-semibold">You</Badge>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {(team.profiles as { display_name: string })?.display_name}
                              </p>
                            </div>
                          </div>
                        </td>
                        {(matches ?? []).map((m: { id: string }) => (
                          <td key={m.id} className="px-3 py-4 text-center text-sm">
                            {selectionsByTeam[team.id]?.[m.id] != null
                              ? <span className="font-medium">{selectionsByTeam[team.id][m.id].toFixed(1)}</span>
                              : <span className="text-muted-foreground">—</span>
                            }
                          </td>
                        ))}
                        <td className="px-6 py-4 text-right">
                          <span className="text-lg font-bold text-[#262162]">{team.total_points.toFixed(1)}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
