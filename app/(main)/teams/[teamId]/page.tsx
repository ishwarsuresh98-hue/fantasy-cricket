import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { PLAYER_ROLE_LABELS } from '@/lib/scoring'
import { buildGameweeks } from '@/lib/gameweeks'

const ROLE_BADGE: Record<string, string> = {
  batsman:       'bg-blue-100 text-blue-700',
  bowler:        'bg-[#fceaea] text-[#b5211e]',
  all_rounder:   'bg-[#eeedf8] text-[#262162]',
  wicket_keeper: 'bg-[#fefde8] text-[#262162]',
}

// ── Types ─────────────────────────────────────────────────────────────────────

type MatchMeta = {
  id: string
  match_number: number
  opponent: string
  match_date: string
  status: string
  result: string | null
}

type SelRow = {
  match_id: string
  player_id: string
  is_captain: boolean
  is_vice_captain: boolean
  points_earned: number
  players: { id: string; name: string; role: string }
  matches: MatchMeta
}

type PerfRow = {
  match_id: string
  player_id: string
  runs_scored: number
  balls_faced: number | null
  fours: number | null
  sixes: number | null
  wickets: number | null
  catches: number | null
  stumpings: number | null
  maidens: number | null
  dot_balls: number | null
  base_points: number
  did_not_bat: boolean
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = await params
  const supabase = await createClient()

  // ── Fantasy team + owner ──────────────────────────────────────────────────
  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id, team_name, total_points, user_id, profiles(display_name)')
    .eq('id', teamId)
    .single()

  if (!team) notFound()

  const owner =
    (team.profiles as unknown as { display_name: string } | null)
      ?.display_name ?? 'Unknown'

  // ── All selections for this team ──────────────────────────────────────────
  const { data: selData } = await supabase
    .from('fantasy_selections')
    .select(
      'match_id, player_id, is_captain, is_vice_captain, points_earned, ' +
      'players(id, name, role), ' +
      'matches(id, match_number, opponent, match_date, status, result)',
    )
    .eq('fantasy_team_id', teamId)

  const selections = (selData ?? []) as unknown as SelRow[]

  // ── Collect unique matches ────────────────────────────────────────────────
  const matchMetaMap = new Map<string, MatchMeta>()
  for (const sel of selections) {
    if (!matchMetaMap.has(sel.match_id)) {
      matchMetaMap.set(sel.match_id, sel.matches)
    }
  }

  // Sort matches ascending by date for gameweek ordering
  const allMatchesList = [...matchMetaMap.values()].sort(
    (a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime(),
  )

  const completedMatchIds = allMatchesList
    .filter((m) => m.status === 'completed')
    .map((m) => m.id)

  // ── Fetch match performances (LEFT JOIN equivalent — missing perf = no row) ─
  const { data: perfData } =
    completedMatchIds.length > 0
      ? await supabase
          .from('match_performances')
          .select(
            'match_id, player_id, runs_scored, balls_faced, fours, sixes, ' +
            'wickets, catches, stumpings, maidens, dot_balls, base_points, did_not_bat',
          )
          .in('match_id', completedMatchIds)
      : { data: [] }

  const performances = (perfData ?? []) as unknown as PerfRow[]

  // matchId → playerId → PerfRow
  const perfByMatchPlayer = new Map<string, Map<string, PerfRow>>()
  for (const perf of performances) {
    if (!perfByMatchPlayer.has(perf.match_id))
      perfByMatchPlayer.set(perf.match_id, new Map())
    perfByMatchPlayer.get(perf.match_id)!.set(perf.player_id, perf)
  }

  // ── Group selections by match, sort by base_points DESC ──────────────────
  const selsByMatch = new Map<string, SelRow[]>()
  for (const sel of selections) {
    if (!selsByMatch.has(sel.match_id)) selsByMatch.set(sel.match_id, [])
    selsByMatch.get(sel.match_id)!.push(sel)
  }
  for (const [matchId, sels] of selsByMatch) {
    const perfMap = perfByMatchPlayer.get(matchId) ?? new Map()
    sels.sort(
      (a, b) =>
        (perfMap.get(b.player_id)?.base_points ?? 0) -
        (perfMap.get(a.player_id)?.base_points ?? 0),
    )
  }

  // ── Gameweeks ─────────────────────────────────────────────────────────────
  const gameweeks = buildGameweeks(allMatchesList)

  // ── Helpers ───────────────────────────────────────────────────────────────
  const cell = (v: number | null | undefined) => (v ?? 0) || '—'

  function fmtPts(pts: number): string {
    return pts % 1 === 0 ? pts.toString() : pts.toFixed(1)
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  const hasHistory = gameweeks.length > 0

  return (
    <div className="space-y-6">

      {/* Breadcrumb + header */}
      <div>
        <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
          <Link href="/teams" className="hover:text-[#262162] hover:underline">
            Teams
          </Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">{team.team_name}</span>
        </div>
        <h1 className="text-3xl font-bold text-[#262162]">{team.team_name}</h1>
        <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
          <span>{owner}</span>
          <span>·</span>
          <span className="font-semibold text-[#262162]">
            {Number(team.total_points).toFixed(1)} pts
          </span>
        </div>
      </div>

      {!hasHistory ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-muted-foreground">No match history yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          {gameweeks.map((gw) => {
            // Matches in this GW that this team has selections for
            const gwMatches = gw.matchIds
              .map((id) => matchMetaMap.get(id))
              .filter((m): m is MatchMeta => !!m)
              .sort((a, b) => a.match_number - b.match_number)

            if (gwMatches.length === 0) return null

            // GW total = sum of points_earned across all selections in this GW
            const gwTotal = gw.matchIds.reduce((sum, mid) => {
              const sels = selsByMatch.get(mid) ?? []
              return sum + sels.reduce((s, sel) => s + (sel.points_earned ?? 0), 0)
            }, 0)

            return (
              <div key={gw.dateStr}>

                {/* Gameweek header */}
                <div className="flex items-center gap-3 mb-4 px-1 text-[#262162]">
                  <div className="h-px flex-1 bg-[#262162]/30" />
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-sm font-semibold">Gameweek {gw.gw}</span>
                    <span className="text-sm text-[#262162]/60">— {gw.label}</span>
                    <Badge className="bg-[#262162] text-white text-xs font-bold hover:bg-[#262162]">
                      {fmtPts(gwTotal)} pts
                    </Badge>
                  </div>
                  <div className="h-px flex-1 bg-[#262162]/30" />
                </div>

                {/* Match cards */}
                <div className="space-y-4">
                  {gwMatches.map((match) => {
                    const matchSels = selsByMatch.get(match.id) ?? []
                    const perfMap = perfByMatchPlayer.get(match.id) ?? new Map()
                    const matchTotal = matchSels.reduce(
                      (s, sel) => s + (sel.points_earned ?? 0),
                      0,
                    )
                    const isCompleted = match.status === 'completed'

                    return (
                      <Card key={match.id}>
                        <CardHeader className="pb-3 bg-[#eeedf8] rounded-t-xl">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <CardTitle className="text-[#262162] text-sm font-semibold">
                                <Link
                                  href={`/matches/${match.id}`}
                                  className="hover:underline"
                                >
                                  Match {match.match_number} vs {match.opponent}
                                </Link>
                              </CardTitle>
                              <p className="text-xs text-[#262162]/60 mt-0.5">
                                {new Date(match.match_date).toLocaleDateString(
                                  'en-AU',
                                  { day: 'numeric', month: 'short', year: 'numeric' },
                                )}
                                {match.result && (
                                  <span className="ml-1 font-medium text-[#b5211e]">
                                    · {match.result}
                                  </span>
                                )}
                              </p>
                            </div>
                            {isCompleted && matchSels.length > 0 && (
                              <div className="text-right shrink-0">
                                <p className="text-[#262162] font-bold text-lg leading-none">
                                  {fmtPts(matchTotal)}
                                </p>
                                <p className="text-[#262162]/60 text-[10px] mt-0.5">pts</p>
                              </div>
                            )}
                          </div>
                        </CardHeader>

                        <CardContent className="p-0">
                          {matchSels.length === 0 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                              No squad selected for this match.
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b">
                                  <tr>
                                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-2.5 min-w-[150px]">
                                      Player
                                    </th>
                                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-2.5">
                                      Role
                                    </th>
                                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-2.5">
                                      R
                                    </th>
                                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-2.5">
                                      B
                                    </th>
                                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-2.5">
                                      4s
                                    </th>
                                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-2.5">
                                      6s
                                    </th>
                                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-2.5">
                                      W
                                    </th>
                                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-2.5">
                                      Ct
                                    </th>
                                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-2.5">
                                      Mdns
                                    </th>
                                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-2.5">
                                      Pts
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {matchSels.map((sel) => {
                                    const perf = perfMap.get(sel.player_id)
                                    const role = sel.players.role

                                    return (
                                      <tr
                                        key={sel.player_id}
                                        className="hover:bg-[#eeedf8] transition-colors"
                                      >
                                        {/* Player name with C/VC badge */}
                                        <td className="px-4 py-2.5">
                                          <div className="flex items-center gap-1.5">
                                            {sel.is_captain ? (
                                              <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#fbf927] text-[#262162] text-[10px] font-black">
                                                C
                                              </span>
                                            ) : sel.is_vice_captain ? (
                                              <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-[10px] font-black">
                                                V
                                              </span>
                                            ) : (
                                              <span className="flex-shrink-0 w-5" />
                                            )}
                                            <span className="font-medium">
                                              {sel.players.name}
                                            </span>
                                          </div>
                                        </td>

                                        {/* Role */}
                                        <td className="px-3 py-2.5">
                                          <Badge
                                            className={cn(
                                              'text-xs font-normal',
                                              ROLE_BADGE[role] ?? 'bg-gray-100 text-gray-600',
                                            )}
                                          >
                                            {PLAYER_ROLE_LABELS[role] ?? role}
                                          </Badge>
                                        </td>

                                        {/* Batting stats */}
                                        <td className="px-3 py-2.5 text-center">
                                          {perf
                                            ? perf.did_not_bat
                                              ? <span className="text-muted-foreground text-xs">DNB</span>
                                              : <span className="font-medium">{perf.runs_scored}</span>
                                            : <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="px-3 py-2.5 text-center text-muted-foreground">
                                          {perf && !perf.did_not_bat
                                            ? perf.balls_faced ?? 0
                                            : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                          {perf ? cell(perf.fours) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                          {perf ? cell(perf.sixes) : '—'}
                                        </td>

                                        {/* Bowling / fielding stats */}
                                        <td className="px-3 py-2.5 text-center">
                                          {perf ? cell(perf.wickets) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                          {perf ? cell(perf.catches) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-center text-muted-foreground">
                                          {perf ? cell(perf.maidens) : '—'}
                                        </td>

                                        {/* Fantasy points (includes captain multiplier) */}
                                        <td className="px-4 py-2.5 text-right font-bold text-[#262162]">
                                          {sel.points_earned > 0
                                            ? fmtPts(sel.points_earned)
                                            : <span className="text-muted-foreground font-normal">—</span>}
                                        </td>
                                      </tr>
                                    )
                                  })}

                                  {/* Match total row */}
                                  {isCompleted && (
                                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                                      <td
                                        colSpan={9}
                                        className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                                      >
                                        Match {match.match_number} total
                                      </td>
                                      <td className="px-4 py-2 text-right font-bold text-[#262162]">
                                        {fmtPts(matchTotal)}
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                {/* GW summary footer */}
                {gwMatches.length > 1 && (
                  <div className="mt-3 flex items-center justify-end gap-2 px-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                      Gameweek {gw.gw} total
                    </span>
                    <span className="text-base font-bold text-[#262162]">
                      {fmtPts(gwTotal)}
                    </span>
                    <span className="text-xs text-muted-foreground">pts</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
