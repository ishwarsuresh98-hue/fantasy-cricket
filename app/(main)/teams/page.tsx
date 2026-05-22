import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { PLAYER_ROLE_LABELS } from '@/lib/scoring'
import { computeMatchDayLockWindow } from '@/lib/deadline'
import type { Match } from '@/types'

const ROLE_BADGE: Record<string, string> = {
  batsman:       'bg-blue-100 text-blue-700',
  bowler:        'bg-[#fceaea] text-[#b5211e]',
  all_rounder:   'bg-[#eeedf8] text-[#262162]',
  wicket_keeper: 'bg-[#fefde8] text-[#262162]',
}

export default async function TeamsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // ── Active season ──────────────────────────────────────────────────────────
  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!season) {
    return (
      <div className="text-center py-24">
        <div className="text-5xl mb-4">🏏</div>
        <h2 className="text-2xl font-bold text-gray-800">No Active Season</h2>
        <p className="text-muted-foreground mt-2">Teams will appear once a season is active.</p>
      </div>
    )
  }

  // ── All matches for this season (needed for deadline + ref-match logic) ────
  const { data: allMatches } = await supabase
    .from('matches')
    .select('*')
    .eq('season_id', season.id)
    .order('match_date', { ascending: true })

  const upcomingMatches  = (allMatches ?? []).filter((m: Match) => m.status === 'upcoming')
  const completedMatches = (allMatches ?? []).filter((m: Match) => m.status === 'completed')

  // Next upcoming match; most-recent completed match
  const nextMatch = upcomingMatches[0] as Match | undefined
  const prevMatch = completedMatches.length > 0
    ? completedMatches[completedMatches.length - 1] as Match   // already sorted asc
    : undefined

  // ── Squad visibility rule ──────────────────────────────────────────────────
  //
  //  BEFORE the deadline (1 h before next match):
  //    → show each team's squad for the LAST COMPLETED match.
  //      (Hides any transfer changes made in preparation for the upcoming match.)
  //
  //  AFTER the deadline (or no upcoming match):
  //    → show the UPCOMING match's squad (now locked in).
  //
  const lockWindow     = computeMatchDayLockWindow(upcomingMatches)
  const deadlinePassed = lockWindow ? Date.now() >= lockWindow.lockStart.getTime() : false

  // The reference match whose selections we'll display
  const refMatch: Match | undefined =
    nextMatch && deadlinePassed
      ? nextMatch   // deadline passed → upcoming squad is locked, safe to show
      : prevMatch   // before deadline → show last completed squad

  // Human-readable label for the sub-heading
  const refLabel = refMatch
    ? deadlinePassed && refMatch.id === nextMatch?.id
      ? `Match ${refMatch.match_number} vs ${refMatch.opponent} (locked)`
      : `Match ${refMatch.match_number} vs ${refMatch.opponent}`
    : null

  // Banner shown when upcoming-match transfers are being hidden
  const hiddenBehindDeadline = !!nextMatch && !deadlinePassed

  // ── All fantasy teams for the active season ────────────────────────────────
  // Note: profiles.display_name is the correct column name.
  // Migration 013 ensures all authenticated members can read all profiles,
  // so the join returns real names instead of null.
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, team_name, total_points, user_id, profiles(display_name)')
    .eq('season_id', season.id)
    .order('total_points', { ascending: false })

  // ── Selections for the reference match, joined with player data ───────────
  const { data: selections } = refMatch
    ? await supabase
        .from('fantasy_selections')
        .select('fantasy_team_id, is_captain, is_vice_captain, players(id, name, role)')
        .eq('match_id', refMatch.id)
    : { data: [] }

  // Group selections by fantasy team
  type SelRow = {
    fantasy_team_id: string
    is_captain: boolean
    is_vice_captain: boolean
    players: { id: string; name: string; role: string }
  }

  const squadByTeam = new Map<string, SelRow[]>()
  for (const sel of (selections ?? []) as unknown as SelRow[]) {
    if (!squadByTeam.has(sel.fantasy_team_id)) squadByTeam.set(sel.fantasy_team_id, [])
    squadByTeam.get(sel.fantasy_team_id)!.push(sel)
  }

  // Sort each squad: captain first, then vice-captain, then alphabetical
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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[#262162]">All Teams</h1>
        <p className="text-muted-foreground mt-1">
          {season.name}
          {refLabel && (
            <span className="ml-2 text-sm">
              — squads for <span className="font-medium">{refLabel}</span>
            </span>
          )}
        </p>
        {hiddenBehindDeadline && (
          <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
            🔒 Transfer changes for{' '}
            <span className="font-medium">
              Match {nextMatch!.match_number} vs {nextMatch!.opponent}
            </span>{' '}
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
            // profiles join returns { display_name: string } — see migration 013 for RLS fix
            // Cast via unknown because the Supabase inferred type wraps joins in an array
            const owner = (team.profiles as unknown as { display_name: string } | null)?.display_name ?? 'Unknown'
            const rank  = idx + 1

            return (
              <Card
                key={team.id}
                className={cn(
                  'flex flex-col transition-shadow hover:shadow-md',
                  isMe && 'ring-2 ring-[#262162]',
                )}
              >
                {/* Team header */}
                <CardHeader className="pb-3 bg-[#262162] rounded-t-xl">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={cn(
                        'flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold',
                        rank === 1 ? 'bg-[#fbf927] text-[#262162]' :
                        rank === 2 ? 'bg-gray-300 text-gray-700'   :
                        rank === 3 ? 'bg-orange-200 text-orange-800' :
                        'bg-white/20 text-white'
                      )}>
                        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                      </span>
                      <div className="min-w-0">
                        <CardTitle className="text-white text-sm font-semibold truncate flex items-center gap-1.5">
                          {team.team_name}
                          {isMe && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-[#fbf927] text-[#262162] hover:bg-[#fbf927] font-bold flex-shrink-0">
                              You
                            </Badge>
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Avatar className="h-4 w-4">
                            <AvatarFallback className="text-[8px] bg-white/20 text-white font-bold">
                              {owner.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <p className="text-white/70 text-xs truncate">{owner}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[#fbf927] font-bold text-lg leading-none">
                        {Number(team.total_points).toFixed(1)}
                      </p>
                      <p className="text-white/60 text-[10px] mt-0.5">pts</p>
                    </div>
                  </div>
                </CardHeader>

                {/* Player list */}
                <CardContent className="p-0 flex-1">
                  {squad.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No squad selected yet
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {squad.map((sel) => (
                        <li
                          key={sel.players.id}
                          className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
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
                            <span className="text-sm font-medium truncate">{sel.players.name}</span>
                          </div>
                          <Badge className={cn(
                            'text-[10px] px-1.5 py-0 flex-shrink-0 ml-2',
                            ROLE_BADGE[sel.players.role] ?? 'bg-gray-100 text-gray-600',
                          )}>
                            {PLAYER_ROLE_LABELS[sel.players.role] ?? sel.players.role}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
