import { createClient } from '@/lib/supabase/server'
import TeamBuilder from '@/components/team/TeamBuilder'
import BoosterPanel from '@/components/boosters/BoosterPanel'
import DeadlineCountdown from '@/components/DeadlineCountdown'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { computeMatchDayDeadline, isDeadlinePassed } from '@/lib/deadline'
import type { Player, Match, FantasyTeam, FantasySelection, TeamBooster } from '@/types'

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

  // Fetch all upcoming matches to compute the match-day deadline
  const { data: upcomingMatches } = await supabase
    .from('matches')
    .select('match_date')
    .eq('season_id', season.id)
    .eq('status', 'upcoming')
    .order('match_date')

  const deadline = computeMatchDayDeadline(upcomingMatches ?? [])
  const deadlinePassed = isDeadlinePassed(deadline)

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

  // Free Hit logic:
  // 1. Is Free Hit active for the next match?
  const freeHitActive = (boosterUsage ?? []).some(
    (b: TeamBooster) => b.match_id === nextMatch.id && b.booster_type === 'free_hit'
  )

  // 2. Squad restoration: if no selections for next match exist,
  //    check if the last completed match had a free_hit booster for this team,
  //    and if so load the snapshot as the pre-populated squad.
  if (existingSelections.length === 0 && myTeam) {
    const { data: lastCompletedMatch } = await supabase
      .from('matches')
      .select('id')
      .eq('season_id', season.id)
      .eq('status', 'completed')
      .order('match_date', { ascending: false })
      .limit(1)
      .single()

    if (lastCompletedMatch) {
      const hadFreeHit = (boosterUsage ?? []).some(
        (b: TeamBooster) =>
          b.match_id === lastCompletedMatch.id && b.booster_type === 'free_hit'
      )
      if (hadFreeHit) {
        const { data: snapshot } = await supabase
          .from('free_hit_snapshots')
          .select('snapshot')
          .eq('fantasy_team_id', myTeam.id)
          .eq('match_id', lastCompletedMatch.id)
          .single()

        if (snapshot?.snapshot && Array.isArray(snapshot.snapshot)) {
          // Reconstruct FantasySelection-like objects from snapshot so TeamBuilder pre-selects them
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
  }

  return (
    <div className="space-y-6">
      {/* Deadline countdown / locked banner */}
      {deadline && (
        <DeadlineCountdown deadline={deadline.toISOString()} />
      )}

      {myTeam && (
        <BoosterPanel
          fantasyTeamId={myTeam.id}
          matchId={nextMatch.id}
          matchStatus={nextMatch.status}
          boosterUsage={(boosterUsage ?? []) as TeamBooster[]}
          currentSelections={existingSelections}
          players={(players ?? []) as Player[]}
          deadlinePassed={deadlinePassed}
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
        deadlinePassed={deadlinePassed}
      />
    </div>
  )
}
