import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { PLAYER_ROLE_LABELS } from '@/lib/scoring'
import { buildGameweeks } from '@/lib/gameweeks'

const ROLE_BADGE: Record<string, string> = {
  batsman:       'bg-blue-100 text-blue-700',
  bowler:        'bg-[#fceaea] text-[#b5211e]',
  all_rounder:   'bg-[#1c1c1c] text-[#C9A84C]',
  wicket_keeper: 'bg-[#fef9ee] text-[#C9A84C]',
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
  wickets: number | null
  catches: number | null
  fours: number | null
  sixes: number | null
  maidens: number | null
  base_points: number
  did_not_bat: boolean
}

// One aggregated row per player per gameweek
type GwPlayerRow = {
  playerId:        string
  playerName:      string
  playerRole:      string
  isCaptain:       boolean
  isViceCaptain:   boolean
  totalRuns:       number
  totalWickets:    number
  totalBasePoints: number   // sum of match_performances.base_points
  totalEarned:     number   // sum of fantasy_selections.points_earned (incl. C/VC/booster mult)
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
    if (!matchMetaMap.has(sel.match_id))
      matchMetaMap.set(sel.match_id, sel.matches)
  }

  const allMatchesList = [...matchMetaMap.values()].sort(
    (a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime(),
  )

  const completedMatchIds = allMatchesList
    .filter((m) => m.status === 'completed')
    .map((m) => m.id)

  // ── Fetch performances ────────────────────────────────────────────────────
  const { data: perfData } =
    completedMatchIds.length > 0
      ? await supabase
          .from('match_performances')
          .select(
            'match_id, player_id, runs_scored, wickets, catches, fours, sixes, ' +
            'maidens, base_points, did_not_bat',
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

  // matchId → SelRow[]
  const selsByMatch = new Map<string, SelRow[]>()
  for (const sel of selections) {
    if (!selsByMatch.has(sel.match_id)) selsByMatch.set(sel.match_id, [])
    selsByMatch.get(sel.match_id)!.push(sel)
  }

  // ── Gameweeks ─────────────────────────────────────────────────────────────
  const gameweeks = buildGameweeks(allMatchesList)

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmtPts(n: number): string {
    return n % 1 === 0 ? n.toString() : n.toFixed(1)
  }

  function fmtBonus(bonus: number) {
    if (bonus === 0) return <span className="text-muted-foreground">—</span>
    if (bonus > 0)   return <span className="font-semibold text-green-600">+{fmtPts(bonus)}</span>
    return               <span className="font-semibold text-red-500">{fmtPts(bonus)}</span>
  }

  // ── Aggregate per-GW player rows ──────────────────────────────────────────
  // Returns one GwPlayerRow per player, summing stats across every match in the GW.
  // C/VC flag is taken from the first selection encountered (consistent within a GW).
  function buildGwRows(matchIds: string[]): GwPlayerRow[] {
    const byPlayer = new Map<string, GwPlayerRow>()

    for (const matchId of matchIds) {
      const sels    = selsByMatch.get(matchId) ?? []
      const perfMap = perfByMatchPlayer.get(matchId) ?? new Map()

      for (const sel of sels) {
        const pid = sel.player_id

        if (!byPlayer.has(pid)) {
          byPlayer.set(pid, {
            playerId:        pid,
            playerName:      sel.players.name,
            playerRole:      sel.players.role,
            isCaptain:       sel.is_captain,
            isViceCaptain:   sel.is_vice_captain,
            totalRuns:       0,
            totalWickets:    0,
            totalBasePoints: 0,
            totalEarned:     0,
          })
        }

        const row  = byPlayer.get(pid)!
        const perf = perfMap.get(pid)

        row.totalEarned += sel.points_earned ?? 0

        if (perf) {
          if (!perf.did_not_bat) row.totalRuns    += perf.runs_scored ?? 0
          row.totalWickets    += perf.wickets     ?? 0
          row.totalBasePoints += perf.base_points ?? 0
        }
      }
    }

    // Sort: captain first, then VC, then by total points earned descending
    return [...byPlayer.values()].sort((a, b) => {
      if (a.isCaptain      && !b.isCaptain)      return -1
      if (!a.isCaptain     && b.isCaptain)        return  1
      if (a.isViceCaptain  && !b.isViceCaptain)   return -1
      if (!a.isViceCaptain && b.isViceCaptain)    return  1
      return b.totalEarned - a.totalEarned
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Breadcrumb + header */}
      <div>
        <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
          <Link href="/teams" className="hover:text-[#C9A84C] hover:underline">
            Teams
          </Link>
          <span>/</span>
          <span className="text-[#0b0b0b] font-medium">{team.team_name}</span>
        </div>
        <h1 className="text-3xl font-bold text-[#C9A84C]">{team.team_name}</h1>
        <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
          <span>{owner}</span>
          <span>·</span>
          <span className="font-semibold text-[#C9A84C]">
            {Number(team.total_points).toFixed(1)} pts
          </span>
        </div>
      </div>

      {gameweeks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-muted-foreground">No match history yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          {gameweeks.map((gw) => {
            // Only include match IDs this team actually has selections for
            const gwMatchIds = gw.matchIds.filter((id) => matchMetaMap.has(id))
            if (gwMatchIds.length === 0) return null

            const rows    = buildGwRows(gwMatchIds)
            const gwTotal = rows.reduce((s, r) => s + r.totalEarned, 0)

            // Sub-heading: list of opponents in this GW
            const gwMatchMetas = gwMatchIds
              .map((id) => matchMetaMap.get(id)!)
              .sort((a, b) => a.match_number - b.match_number)
            const opponentLine = gwMatchMetas
              .map((m) => `M${m.match_number} vs ${m.opponent}`)
              .join(' · ')

            return (
              <div key={gw.dateStr}>

                {/* Gameweek header */}
                <div className="flex items-center gap-3 mb-1 px-1">
                  <div className="h-px flex-1 bg-[#f5f5f5]/20" />
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#C9A84C]">
                      Gameweek {gw.gw}
                    </span>
                    <span className="text-sm text-[#C9A84C]/60">— {gw.label}</span>
                    <Badge className="bg-[#f0f0f0] text-[#0b0b0b] text-xs font-bold hover:bg-[#f0f0f0]">
                      {fmtPts(gwTotal)} pts
                    </Badge>
                  </div>
                  <div className="h-px flex-1 bg-[#f5f5f5]/20" />
                </div>

                {/* Match context line */}
                <p className="text-xs text-muted-foreground text-center mb-4 px-1">
                  {opponentLine}
                </p>

                {/* One table for the whole gameweek */}
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[#f8f8f8] border-b">
                          <tr>
                            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3 min-w-[160px]">
                              Player
                            </th>
                            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">
                              Role
                            </th>
                            <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">
                              R
                            </th>
                            <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">
                              W
                            </th>
                            <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3 whitespace-nowrap">
                              Pts (base)
                            </th>
                            <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">
                              Bonus
                            </th>
                            <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3 whitespace-nowrap">
                              Total Pts
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                          {rows.map((row) => {
                            const bonus = row.totalEarned - row.totalBasePoints

                            return (
                              <tr
                                key={row.playerId}
                                className="hover:bg-[#fef9ee] transition-colors"
                              >
                                {/* Player + C/VC badge */}
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    {row.isCaptain ? (
                                      <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#C9A84C] text-[#0b0b0b] text-[10px] font-black">
                                        C
                                      </span>
                                    ) : row.isViceCaptain ? (
                                      <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-[10px] font-black">
                                        V
                                      </span>
                                    ) : (
                                      <span className="flex-shrink-0 w-5" />
                                    )}
                                    <Link
                                      href={`/players/${row.playerId}`}
                                      className="font-medium hover:text-[#C9A84C] hover:underline"
                                    >
                                      {row.playerName}
                                    </Link>
                                  </div>
                                </td>

                                {/* Role badge */}
                                <td className="px-3 py-2.5">
                                  <Badge
                                    className={cn(
                                      'text-xs font-normal',
                                      ROLE_BADGE[row.playerRole] ?? 'bg-[#141414] text-gray-600',
                                    )}
                                  >
                                    {PLAYER_ROLE_LABELS[row.playerRole] ?? row.playerRole}
                                  </Badge>
                                </td>

                                {/* Runs */}
                                <td className="px-3 py-2.5 text-center">
                                  {row.totalRuns > 0
                                    ? <span className="font-medium">{row.totalRuns}</span>
                                    : <span className="text-muted-foreground">—</span>}
                                </td>

                                {/* Wickets */}
                                <td className="px-3 py-2.5 text-center">
                                  {row.totalWickets > 0
                                    ? <span className="font-medium">{row.totalWickets}</span>
                                    : <span className="text-muted-foreground">—</span>}
                                </td>

                                {/* Base points */}
                                <td className="px-3 py-2.5 text-center text-muted-foreground">
                                  {row.totalBasePoints > 0
                                    ? fmtPts(row.totalBasePoints)
                                    : '—'}
                                </td>

                                {/* Bonus (multiplier effect) */}
                                <td className="px-3 py-2.5 text-center">
                                  {fmtBonus(bonus)}
                                </td>

                                {/* Total fantasy points */}
                                <td className="px-4 py-2.5 text-right font-bold text-[#C9A84C]">
                                  {row.totalEarned > 0
                                    ? fmtPts(row.totalEarned)
                                    : <span className="text-muted-foreground font-normal">—</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>

                        {/* GW total footer row */}
                        <tfoot>
                          <tr className="bg-[#f0f0f0]">
                            <td
                              colSpan={6}
                              className="px-4 py-2.5 text-xs font-semibold text-[#0b0b0b]/70 uppercase tracking-wide"
                            >
                              Gameweek {gw.gw} total
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-[#C9A84C] text-base">
                              {fmtPts(gwTotal)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>

              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
