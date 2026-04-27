import { createClient } from '@/lib/supabase/server'
import TeamBuilder from '@/components/team/TeamBuilder'
import BoosterPanel from '@/components/boosters/BoosterPanel'
import DeadlineCountdown from '@/components/DeadlineCountdown'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { computeMatchDayLockWindow, getMatchDayDeadline } from '@/lib/deadline'
import type { Player, Match, FantasyTeam, FantasySelection, TeamBooster, PlayerCreditHistory, TransferLog } from '@/types'

export default async function TeamPage() {
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
        <div className="text-5xl mb-4">🏏</div>
        <h2 className="text-2xl font-bold text-gray-800">No Active Season</h2>
        <p className="text-muted-foreground mt-2">An admin needs to activate a season first.</p>
      </div>
    )
  }

  const { data: nextMatch } = await supabase
    .from('matches')
    .select('*')
    .eq('season_id', season.id)
    .eq('status', 'upcoming')
    .order('match_date')
    .limit(1)
    .single()

  // Fetch ALL matches for deadline computation and transfer log processing
  const { data: allMatches } = await supabase
    .from('matches')
    .select('*')
    .eq('season_id', season.id)
    .order('match_date')

  const upcomingMatches = (allMatches ?? []).filter((m: Match) => m.status === 'upcoming')

  // Lock window: locked between lockStart (30 min before earliest match) and lockEnd (30 min after latest match)
  const lockWindow = computeMatchDayLockWindow(upcomingMatches)
  const nowMs = Date.now()
  const deadlinePassed = lockWindow ? nowMs >= lockWindow.lockStart.getTime() : false
  const isLocked       = lockWindow ? nowMs >= lockWindow.lockStart.getTime() && nowMs < lockWindow.lockEnd.getTime() : false
  const lockUntil      = lockWindow?.lockEnd.toISOString() ?? null
  const deadline       = lockWindow?.lockStart ?? null

  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('season_id', season.id)
    .eq('is_active', true)
    .order('price', { ascending: false })

  const { data: myTeam } = await supabase
    .from('fantasy_teams')
    .select('*')
    .eq('season_id', season.id)
    .eq('user_id', user!.id)
    .single()

  // Fetch all boosters used by this team this season
  const { data: boosterUsage } = myTeam
    ? await supabase
        .from('team_boosters')
        .select('*')
        .eq('fantasy_team_id', myTeam.id)
    : { data: [] }

  // Transfer system: fetch logs and compute confirmed transfers
  const { data: allTransferLogs } = myTeam
    ? await supabase
        .from('transfer_logs')
        .select('*')
        .eq('fantasy_team_id', myTeam.id)
        .order('created_at')
    : { data: [] }

  // Compute confirmed transfers = sum of transfers_used from logs where that match's deadline has passed
  // Admin adjustments always count immediately
  let confirmedTransfers = 0
  const now = Date.now()
  for (const log of (allTransferLogs ?? []) as TransferLog[]) {
    if (log.admin_adjustment) {
      confirmedTransfers += log.transfers_used
      continue
    }
    if (!log.match_id) continue
    const logMatch = (allMatches ?? []).find((m: Match) => m.id === log.match_id)
    if (!logMatch) continue
    const matchDeadline = getMatchDayDeadline(logMatch, allMatches ?? [])
    if (matchDeadline && now > matchDeadline.getTime()) {
      confirmedTransfers += log.transfers_used
    }
  }

  const transferLimit = (myTeam as FantasyTeam & { transfer_limit?: number })?.transfer_limit ?? 300

  // Base squad = most recently completed match's selections for this team
  const completedMatches = (allMatches ?? [])
    .filter((m: Match) => m.status === 'completed')
    .sort((a: Match, b: Match) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime())
  const prevMatch = completedMatches[0] as Match | undefined

  let baseSquadIds: string[] = []
  if (myTeam && prevMatch) {
    const { data: prevSelections } = await supabase
      .from('fantasy_selections')
      .select('player_id')
      .eq('fantasy_team_id', myTeam.id)
      .eq('match_id', prevMatch.id)
    baseSquadIds = (prevSelections ?? []).map((s: { player_id: string }) => s.player_id)
  }

  if (!nextMatch) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">My Team</h1>
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-3">📅</div>
            <p className="text-muted-foreground">No upcoming matches to pick a team for.</p>
            <Link href="/matches" className={cn(buttonVariants({ variant: 'outline' }), 'mt-4 inline-flex')}>
              View All Matches
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!players || players.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">My Team</h1>
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-3">👤</div>
            <p className="text-muted-foreground">No players have been added to this season yet.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Load existing selections for the next match
  let existingSelections: FantasySelection[] = []
  if (myTeam && nextMatch) {
    const { data: selections } = await supabase
      .from('fantasy_selections')
      .select('*')
      .eq('fantasy_team_id', myTeam.id)
      .eq('match_id', nextMatch.id)
    existingSelections = selections ?? []
  }

  // Selection percentages — how many teams have each player for this match
  const selectionPercentages: Record<string, number> = {}
  if (nextMatch) {
    const [{ data: selCounts }, { data: allTeams }] = await Promise.all([
      supabase
        .from('fantasy_selections')
        .select('player_id')
        .eq('match_id', nextMatch.id),
      supabase
        .from('fantasy_teams')
        .select('id')
        .eq('season_id', season.id),
    ])
    const totalTeams = (allTeams ?? []).length
    if (totalTeams > 0) {
      const countMap: Record<string, number> = {}
      for (const s of selCounts ?? []) {
        countMap[s.player_id] = (countMap[s.player_id] ?? 0) + 1
      }
      for (const [pid, count] of Object.entries(countMap)) {
        selectionPercentages[pid] = Math.round((count / totalTeams) * 100)
      }
    }
  }

  // Credit trends — use prevMatch (already computed above)
  const creditTrends: Record<string, 'up' | 'down' | 'neutral'> = {}
  if (prevMatch) {
    const { data: recentHistory } = await supabase
      .from('player_credit_history')
      .select('player_id, credit_before, credit_after')
      .eq('match_id', prevMatch.id)
    for (const h of (recentHistory ?? []) as PlayerCreditHistory[]) {
      creditTrends[h.player_id] =
        h.credit_after > h.credit_before ? 'up' :
        h.credit_after < h.credit_before ? 'down' : 'neutral'
    }
  }

  // Free Hit logic:
  // 1. Is Free Hit active for the next match?
  const freeHitActive = (boosterUsage ?? []).some(
    (b: TeamBooster) => b.match_id === nextMatch.id && b.booster_type === 'free_hit'
  )

  // 2. Squad restoration: if no selections for next match exist,
  //    check if the last completed match had a free_hit booster for this team,
  //    and if so load the snapshot as the pre-populated squad.
  if (existingSelections.length === 0 && myTeam && prevMatch) {
    const hadFreeHit = (boosterUsage ?? []).some(
      (b: TeamBooster) =>
        b.match_id === prevMatch.id && b.booster_type === 'free_hit'
    )
    if (hadFreeHit) {
      const { data: snapshot } = await supabase
        .from('free_hit_snapshots')
        .select('snapshot')
        .eq('fantasy_team_id', myTeam.id)
        .eq('match_id', prevMatch.id)
        .single()

      if (snapshot?.snapshot && Array.isArray(snapshot.snapshot)) {
        existingSelections = (snapshot.snapshot as Array<{
          player_id: string
          is_captain: boolean
          is_vice_captain: boolean
        }>).map((s, idx) => ({
          id: `snapshot-${idx}`,
          fantasy_team_id: myTeam.id,
          match_id: nextMatch.id,
          player_id: s.player_id,
          is_captain: s.is_captain,
          is_vice_captain: s.is_vice_captain,
          points_earned: 0,
        }))
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Deadline countdown / in-progress lock banner */}
      {deadline && (
        <DeadlineCountdown
          deadline={deadline.toISOString()}
          lockUntil={lockUntil ?? undefined}
        />
      )}

      {myTeam && (
        <BoosterPanel
          fantasyTeamId={myTeam.id}
          matchId={nextMatch.id}
          matchStatus={nextMatch.status}
          boosterUsage={(boosterUsage ?? []) as TeamBooster[]}
          currentSelections={existingSelections}
          players={(players ?? []) as Player[]}
          deadlinePassed={isLocked}
          currentTeamPoints={(myTeam as FantasyTeam)?.total_points ?? 0}
        />
      )}
      <TeamBuilder
        season={season}
        nextMatch={nextMatch as Match}
        players={(players ?? []) as Player[]}
        myTeam={myTeam as FantasyTeam | null}
        existingSelections={existingSelections}
        userId={user!.id}
        freeHitActive={freeHitActive}
        isLocked={isLocked}
        deadlinePassed={deadlinePassed}
        lockUntil={lockUntil ?? undefined}
        creditTrends={creditTrends}
        baseSquadIds={baseSquadIds}
        confirmedTransfers={confirmedTransfers}
        transferLimit={transferLimit}
        megaTransferActive={(boosterUsage ?? []).some(
          (b: TeamBooster) => b.match_id === nextMatch.id && b.booster_type === 'mega_transfer'
        )}
        selectionPercentages={selectionPercentages}
      />
    </div>
  )
}
