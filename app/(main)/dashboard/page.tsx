import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Match, Season } from '@/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: season }, { data: profile }] = await Promise.all([
    supabase.from('seasons').select('*').eq('is_active', true).single(),
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
  ])

  if (!season) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="text-5xl">🏏</div>
        <h2 className="text-2xl font-bold text-gray-800">No Active Season</h2>
        <p className="text-gray-500">An admin needs to create and activate a season to get started.</p>
        {profile?.role === 'admin' && (
          <Link href="/admin" className={cn(buttonVariants(), 'mt-2 bg-[#262162] hover:bg-[#1a1748]')}>
            Go to Admin Panel
          </Link>
        )}
      </div>
    )
  }

  const s = season as Season

  const [{ data: matches }, { data: myTeam }, { data: allTeams }] = await Promise.all([
    supabase.from('matches').select('*').eq('season_id', s.id).order('match_date'),
    supabase.from('fantasy_teams').select('*').eq('season_id', s.id).eq('user_id', user!.id).single(),
    supabase.from('fantasy_teams').select('*').eq('season_id', s.id).order('total_points', { ascending: false }),
  ])

  const upcomingMatches = (matches ?? []).filter((m: Match) => m.status === 'upcoming')
  const completedMatches = (matches ?? []).filter((m: Match) => m.status === 'completed')
  const nextMatch = upcomingMatches[0] as Match | undefined

  const myRank = allTeams?.findIndex((t) => t.user_id === user!.id) ?? -1
  const rank = myRank >= 0 ? myRank + 1 : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[#262162]">Dashboard</h1>
          <p className="text-gray-500 mt-0.5">{s.name}</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[#262162]">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-sm text-muted-foreground font-medium">My Points</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-[#262162]">{myTeam?.total_points ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#fbf927]">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-sm text-muted-foreground font-medium">My Rank</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-[#262162]">{rank ? `#${rank}` : '—'}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#b5211e]">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-sm text-muted-foreground font-medium">Matches Played</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-gray-800">{completedMatches.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-gray-300">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-sm text-muted-foreground font-medium">Total Teams</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold text-gray-800">{allTeams?.length ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Team & Next Match */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-[#262162]">My Fantasy Team</CardTitle>
          </CardHeader>
          <CardContent>
            {myTeam ? (
              <div className="space-y-3">
                <p className="text-xl font-semibold">{myTeam.team_name}</p>
                <p className="text-sm text-muted-foreground">{myTeam.total_points} points this season</p>
                <Link href="/team" className={cn(buttonVariants({ size: 'sm' }), 'bg-[#262162] hover:bg-[#1a1748]')}>
                  Manage Team
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">You haven&apos;t created a fantasy team yet.</p>
                <Link href="/team" className={cn(buttonVariants({ size: 'sm' }), 'bg-[#262162] hover:bg-[#1a1748]')}>
                  Create Team
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-[#262162]">Next Match</CardTitle>
          </CardHeader>
          <CardContent>
            {nextMatch ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Match {nextMatch.match_number}</Badge>
                  <Badge className="bg-[#fefde8] text-[#262162] border border-[#fbf927] hover:bg-[#fefde8]">
                    Upcoming
                  </Badge>
                </div>
                <p className="text-xl font-semibold">vs {nextMatch.opponent}</p>
                {nextMatch.venue && <p className="text-sm text-muted-foreground">{nextMatch.venue}</p>}
                <p className="text-sm text-muted-foreground">
                  {new Date(nextMatch.match_date).toLocaleDateString('en-AU', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                  })}
                </p>
                <Link href="/team" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'border-[#262162] text-[#262162] hover:bg-[#eeedf8]')}>
                  Select Team for This Match
                </Link>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No upcoming matches scheduled.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent matches */}
      {completedMatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-[#262162]">Recent Matches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {completedMatches.slice(-3).reverse().map((m: Match) => (
                <Link
                  key={m.id}
                  href={`/matches/${m.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-[#eeedf8] transition-colors"
                >
                  <div>
                    <span className="font-medium">Match {m.match_number} vs {m.opponent}</span>
                    {m.result && <p className="text-sm text-muted-foreground">{m.result}</p>}
                  </div>
                  <Badge variant="outline">Completed</Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
