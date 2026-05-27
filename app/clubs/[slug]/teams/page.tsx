import { createClient } from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { computeMatchDayLockWindow } from '@/lib/deadline'
import type { Match, PlayerRole } from '@/types'
import PlayerCard from '@/components/players/PlayerCard'

export default async function ClubTeamsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const base = `/clubs/${slug}`

  const { data: season } = await supabase
    .from('seasons').select('*').eq('is_active', true).eq('club_id', club.id).single()

  if (!season) {
    return (
      <div className="text-center py-24">
        <div className="text-5xl mb-4">🏏</div>
        <h2 className="text-2xl font-bold text-gray-800">No Active Season</h2>
        <p className="text-muted-foreground mt-2">Teams will appear once a season is active.</p>
      </div>
    )
  }

  const { data: allMatches } = await supabase
    .from('matches').select('*').eq('season_id', season.id).order('match_date', { ascending: true })

  const upcomingMatches  = (allMatches ?? []).filter((m: Match) => m.status === 'upcoming')
  const completedMatches = (allMatches ?? []).filter((m: Match) => m.status === 'completed')
  const nextMatch   = upcomingMatches[0] as Match | undefined
  const prevMatch   = completedMatches.length > 0 ? completedMatches[completedMatches.length - 1] as Match : undefined

  const lockWindow     = computeMatchDayLockWindow(upcomingMatches)
  const deadlinePassed = lockWindow ? Date.now() >= lockWindow.lockStart.getTime() : false

  const refMatch: Match | undefined = nextMatch && deadlinePassed ? nextMatch : prevMatch
  const refLabel = refMatch
    ? deadlinePassed && refMatch.id === nextMatch?.id
      ? `Match ${refMatch.match_number} vs ${refMatch.opponent} (locked)`
      : `Match ${refMatch.match_number} vs ${refMatch.opponent}`
    : null
  const hiddenBehindDeadline = !!nextMatch && !deadlinePassed

  const { data: teams } = await supabase
    .from('fantasy_teams').select('id, team_name, total_points, user_id, profiles(display_name)')
    .eq('season_id', season.id).order('total_points', { ascending: false })

  type SelRow = {
    fantasy_team_id: string; match_id: string; is_captain: boolean
    is_vice_captain: boolean; points_earned: number
    players: { id: string; name: string; role: string }
  }
  type EnrichedSelRow = SelRow & { gwPoints: number }

  const allMatchesById = new Map<string, Match>()
  for (const m of (allMatches ?? [])) allMatchesById.set(m.id, m)

  function toDateStr(matchDate: string): string {
    return new Date(matchDate).toISOString().slice(0, 10)
  }

  const queryMatchIds = new Set<string>(completedMatches.map((m: Match) => m.id))
  if (refMatch) queryMatchIds.add(refMatch.id)

  const { data: allSels } = queryMatchIds.size > 0
    ? await supabase
        .from('fantasy_selections')
        .select('fantasy_team_id, match_id, is_captain, is_vice_captain, points_earned, players(id, name, role)')
        .in('match_id', [...queryMatchIds])
    : { data: [] }

  const matchOrder = new Map<string, number>()
  completedMatches.forEach((m: Match, i) => matchOrder.set(m.id, i))
  if (refMatch) matchOrder.set(refMatch.id, completedMatches.length + 1)

  const byTeamMatch = new Map<string, Map<string, SelRow[]>>()
  for (const sel of (allSels ?? []) as unknown as SelRow[]) {
    if (!byTeamMatch.has(sel.fantasy_team_id)) byTeamMatch.set(sel.fantasy_team_id, new Map())
    const matchMap = byTeamMatch.get(sel.fantasy_team_id)!
    if (!matchMap.has(sel.match_id)) matchMap.set(sel.match_id, [])
    matchMap.get(sel.match_id)!.push(sel)
  }

  const squadByTeam = new Map<string, EnrichedSelRow[]>()
  for (const [teamId, matchMap] of byTeamMatch) {
    let bestOrder = -1
    let bestMatchId: string | null = null
    for (const [matchId] of matchMap) {
      const order = matchOrder.get(matchId) ?? -1
      if (order > bestOrder) { bestOrder = order; bestMatchId = matchId }
    }
    if (!bestMatchId) continue
    const bestMatchObj = allMatchesById.get(bestMatchId)
    if (!bestMatchObj) continue
    const gwDate   = toDateStr(bestMatchObj.match_date)
    const baseSels = matchMap.get(bestMatchId)!
    const playerGwPts = new Map<string, number>()
    for (const [matchId, sels] of matchMap) {
      const matchObj = allMatchesById.get(matchId)
      if (!matchObj) continue
      if (toDateStr(matchObj.match_date) !== gwDate) continue
      for (const sel of sels) {
        const pid = sel.players.id
        playerGwPts.set(pid, (playerGwPts.get(pid) ?? 0) + sel.points_earned)
      }
    }
    const enriched: EnrichedSelRow[] = baseSels.map((sel) => ({
      ...sel, gwPoints: playerGwPts.get(sel.players.id) ?? 0,
    }))
    squadByTeam.set(teamId, enriched)
  }

  for (const [, squad] of squadByTeam) {
    squad.sort((a, b) => {
      if (a.is_captain)      return -1
      if (b.is_captain)      return  1
      if (a.is_vice_captain) return -1
      if (b.is_vice_captain) return  1
      return a.players.name.localeCompare(b.players.name)
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#262162]">All Teams</h1>
        <p className="text-muted-foreground mt-1">
          {season.name}
          {refLabel && <span className="ml-2 text-sm">— squads for <span className="font-medium">{refLabel}</span></span>}
        </p>
        {hiddenBehindDeadline && (
          <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
            🔒 Transfer changes for{' '}
            <span className="font-medium">Match {nextMatch!.match_number} vs {nextMatch!.opponent}</span>{' '}
            are hidden until the deadline passes. Showing last locked squads.
          </p>
        )}
      </div>

      {(!teams || teams.length === 0) ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-3">👥</div>
            <p className="text-muted-foreground">No teams have been created yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((team, idx) => {
            const isMe  = team.user_id === user?.id
            const squad = squadByTeam.get(team.id) ?? []
            const owner = (team.profiles as unknown as { display_name: string } | null)?.display_name ?? 'Unknown'
            const rank  = idx + 1

            return (
              <Card key={team.id} className={cn('flex flex-col transition-shadow hover:shadow-md', isMe && 'ring-2 ring-[#262162]')}>
                <CardHeader className="pb-3 bg-[#262162] rounded-t-xl">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={cn('flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold',
                        rank === 1 ? 'bg-[#fbf927] text-[#262162]' :
                        rank === 2 ? 'bg-gray-300 text-gray-700'   :
                        rank === 3 ? 'bg-orange-200 text-orange-800' : 'bg-white/20 text-white')}>
                        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                      </span>
                      <div className="min-w-0">
                        <CardTitle className="text-white text-sm font-semibold truncate flex items-center gap-1.5">
                          {team.team_name}
                          {isMe && <Badge className="text-[10px] px-1.5 py-0 bg-[#fbf927] text-[#262162] hover:bg-[#fbf927] font-bold flex-shrink-0">You</Badge>}
                        </CardTitle>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Avatar className="h-4 w-4">
                            <AvatarFallback className="text-[8px] bg-white/20 text-white font-bold">{owner.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <p className="text-white/70 text-xs truncate">{owner}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[#fbf927] font-bold text-lg leading-none">{Number(team.total_points).toFixed(1)}</p>
                      <p className="text-white/60 text-[10px] mt-0.5">pts</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-0 flex-1">
                  {squad.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">No squad selected yet</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {squad.map((sel) => (
                        <PlayerCard
                          key={sel.players.id} id={sel.players.id} name={sel.players.name}
                          role={sel.players.role as PlayerRole} price={0} size="compact"
                          isCaptain={sel.is_captain} isViceCaptain={sel.is_vice_captain} gwPoints={sel.gwPoints}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>

                <div className="px-4 py-3 border-t border-gray-100">
                  <Link href={`${base}/teams/${team.id}`} className="flex items-center justify-center w-full px-4 py-2 rounded-lg bg-[#262162] text-white text-sm font-semibold hover:bg-[#1a1748] transition-colors">
                    View History
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
