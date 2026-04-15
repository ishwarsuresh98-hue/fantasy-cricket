import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PLAYER_ROLE_LABELS } from '@/lib/scoring'
import PlayerCharts from '@/components/players/PlayerCharts'
import FormStrip from '@/components/players/FormStrip'

const ROLE_COLORS: Record<string, string> = {
  batsman:       'bg-blue-100 text-blue-700',
  bowler:        'bg-[#fceaea] text-[#b5211e]',
  all_rounder:   'bg-[#eeedf8] text-[#262162]',
  wicket_keeper: 'bg-[#fefde8] text-[#262162]',
}

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch player
  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', id)
    .single()

  if (!player) notFound()

  // Fetch all season matches (for DNP detection)
  const { data: allMatches } = await supabase
    .from('matches')
    .select('id, match_number, match_date, opponent, status')
    .eq('season_id', player.season_id)
    .eq('status', 'completed')
    .order('match_number')

  // Fetch this player's performances
  const { data: performances } = await supabase
    .from('match_performances')
    .select('match_id, runs_scored, balls_faced, wickets, catches, stumpings, run_outs, did_not_bat, base_points')
    .eq('player_id', id)

  // Fetch credit history
  const { data: creditHistory } = await supabase
    .from('player_credit_history')
    .select('match_id, credit_before, credit_after, base_points, match_avg')
    .eq('player_id', id)
    .order('created_at')

  const matches = allMatches ?? []
  const perfs = performances ?? []
  const history = creditHistory ?? []

  // Build a map: match_id → performance
  const perfByMatch = new Map(perfs.map((p) => [p.match_id, p]))

  // Build a map: match_id → credit history entry
  const histByMatch = new Map(history.map((h) => [h.match_id, h]))

  // Stats summary
  const playedPerfs = perfs.filter((p) => !p.did_not_bat || p.wickets > 0 || p.catches > 0 || p.stumpings > 0 || p.run_outs > 0)
  const totalPoints = perfs.reduce((s, p) => s + (p.base_points ?? 0), 0)
  const avgPoints   = playedPerfs.length > 0 ? totalPoints / playedPerfs.length : 0
  const highScore   = perfs.reduce((m, p) => Math.max(m, p.base_points ?? 0), 0)
  const matchesPlayed = playedPerfs.length

  // Points line chart data (only played matches, sorted by match number)
  const pointsData = matches
    .filter((m) => perfByMatch.has(m.id))
    .map((m) => ({
      match: m.match_number,
      points: Math.round(perfByMatch.get(m.id)!.base_points ?? 0),
    }))

  // Stats bar chart data
  const statsData = matches
    .filter((m) => perfByMatch.has(m.id))
    .map((m) => {
      const p = perfByMatch.get(m.id)!
      return {
        match: m.match_number,
        runs: p.runs_scored,
        wickets: p.wickets,
        catches: p.catches,
      }
    })

  // Credit history chart — show starting credit then all adjustments
  const creditData: { match: number; credit: number }[] = []
  if (history.length > 0) {
    // Starting point: credit_before of first history entry
    const firstMatch = matches.find((m) => m.id === history[0].match_id)
    if (firstMatch) {
      creditData.push({ match: firstMatch.match_number - 1, credit: Number(history[0].credit_before) })
    }
    for (const h of history) {
      const m = matches.find((mm) => mm.id === h.match_id)
      if (m) creditData.push({ match: m.match_number, credit: Number(h.credit_after) })
    }
  }

  // Form strip — last 5 completed season matches
  const last5Matches = matches.slice(-5)
  const formEntries = last5Matches.map((m) => {
    const perf = perfByMatch.get(m.id)
    const hist = histByMatch.get(m.id)
    if (!perf) return { matchNumber: m.match_number, status: 'dnp' as const }
    const avg = hist?.match_avg ?? null
    if (avg === null) return { matchNumber: m.match_number, status: 'dnp' as const, points: Math.round(perf.base_points) }
    const status = perf.base_points > avg ? 'above' : perf.base_points < avg ? 'below' : 'above'
    return { matchNumber: m.match_number, status: status as 'above' | 'below', points: Math.round(perf.base_points) }
  })

  // Credit trend
  const latestHist = history[history.length - 1]
  const creditTrend = latestHist
    ? latestHist.credit_after > latestHist.credit_before ? 'up'
    : latestHist.credit_after < latestHist.credit_before ? 'down'
    : 'neutral'
    : 'neutral'

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/team" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-[#262162]">
        ← Back
      </Link>

      {/* Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-[#262162]">{player.name}</h1>
              <Badge className={`${ROLE_COLORS[player.role]} hover:${ROLE_COLORS[player.role]}`}>
                {PLAYER_ROLE_LABELS[player.role]}
              </Badge>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Current Credits</p>
              <div className="flex items-center gap-1 justify-end">
                <span className="text-3xl font-bold text-[#262162]">{Number(player.price).toFixed(1)}</span>
                {creditTrend === 'up'   && <span className="text-green-600 text-xl font-bold">↑</span>}
                {creditTrend === 'down' && <span className="text-red-500  text-xl font-bold">↓</span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form strip */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-[#262162]">Recent Form (Last 5 Matches)</CardTitle>
          <p className="text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-sm bg-green-500 mr-1" />above avg&nbsp;&nbsp;
            <span className="inline-block w-3 h-3 rounded-sm bg-red-400 mr-1" />below avg&nbsp;&nbsp;
            <span className="inline-block w-3 h-3 rounded-sm bg-gray-200 mr-1" />did not play
          </p>
        </CardHeader>
        <CardContent>
          <FormStrip form={formEntries} />
        </CardContent>
      </Card>

      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Points', value: Math.round(totalPoints) },
          { label: 'Avg per Match', value: avgPoints.toFixed(1) },
          { label: 'Highest Score', value: Math.round(highScore) },
          { label: 'Matches Played', value: matchesPlayed },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold text-[#262162]">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      {matches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No completed matches yet — check back after the first gameweek.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-[#262162]">Performance Charts</CardTitle>
          </CardHeader>
          <CardContent>
            <PlayerCharts
              pointsData={pointsData}
              statsData={statsData}
              creditData={creditData}
              avgPoints={Math.round(avgPoints)}
            />
          </CardContent>
        </Card>
      )}

      {/* Per-match table */}
      {matches.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-[#262162]">Match Log</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">#</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Opponent</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Runs</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Wkts</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Ct</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Pts</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {matches.map((m) => {
                    const p = perfByMatch.get(m.id)
                    const h = histByMatch.get(m.id)
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-muted-foreground">{m.match_number}</td>
                        <td className="px-4 py-2 text-sm truncate max-w-[140px]">{m.opponent}</td>
                        {p ? (
                          <>
                            <td className="px-3 py-2 text-center">{p.did_not_bat ? '–' : p.runs_scored}</td>
                            <td className="px-3 py-2 text-center">{p.wickets || '–'}</td>
                            <td className="px-3 py-2 text-center">{p.catches || '–'}</td>
                            <td className="px-4 py-2 text-right font-bold text-[#262162]">{Math.round(p.base_points)}</td>
                          </>
                        ) : (
                          <td colSpan={4} className="px-4 py-2 text-center text-muted-foreground text-xs">Did not play</td>
                        )}
                        <td className="px-4 py-2 text-right text-xs">
                          {h ? (
                            <span className={h.credit_after > h.credit_before ? 'text-green-600 font-semibold' : h.credit_after < h.credit_before ? 'text-red-500 font-semibold' : 'text-muted-foreground'}>
                              {Number(h.credit_after).toFixed(1)}
                              {h.credit_after > h.credit_before && ' ↑'}
                              {h.credit_after < h.credit_before && ' ↓'}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
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
