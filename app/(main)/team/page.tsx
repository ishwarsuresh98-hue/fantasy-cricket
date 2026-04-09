import { createClient } from '@/lib/supabase/server'
import TeamBuilder from '@/components/team/TeamBuilder'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Player, Match, FantasyTeam, FantasySelection } from '@/types'

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

  let existingSelections: FantasySelection[] = []
  if (myTeam && nextMatch) {
    const { data: selections } = await supabase
      .from('fantasy_selections')
      .select('*')
      .eq('fantasy_team_id', myTeam.id)
      .eq('match_id', nextMatch.id)
    existingSelections = selections ?? []
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

  return (
    <TeamBuilder
      season={season}
      nextMatch={nextMatch as Match}
      players={players as Player[]}
      myTeam={myTeam as FantasyTeam | null}
      existingSelections={existingSelections}
      userId={user!.id}
    />
  )
}
