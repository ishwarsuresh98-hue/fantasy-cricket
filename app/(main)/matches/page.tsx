import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Match } from '@/types'

export default async function MatchesPage() {
  const supabase = await createClient()

  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!season) {
    return (
      <div className="text-center py-24">
        <div className="text-5xl mb-4">📅</div>
        <h2 className="text-2xl font-bold text-gray-800">No Active Season</h2>
      </div>
    )
  }

  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('season_id', season.id)
    .order('match_date')

  const upcoming = (matches ?? []).filter((m: Match) => m.status === 'upcoming')
  const completed = (matches ?? []).filter((m: Match) => m.status === 'completed').reverse()

  const MatchCard = ({ match }: { match: Match }) => (
    <Link href={`/matches/${match.id}`}>
      <div className="flex items-center justify-between p-4 rounded-lg border bg-white hover:bg-[#eeedf8] hover:border-[#262162] transition-colors cursor-pointer group">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Match {match.match_number}</Badge>
            {match.status === 'completed'
              ? <Badge className="text-xs bg-gray-100 text-gray-600 hover:bg-gray-100">Completed</Badge>
              : <Badge className="text-xs bg-[#fefde8] text-[#262162] border border-[#fbf927] hover:bg-[#fefde8]">Upcoming</Badge>
            }
          </div>
          <p className="font-semibold text-gray-900 group-hover:text-[#262162]">{match.opponent}</p>
          {match.venue && <p className="text-sm text-muted-foreground">{match.venue}</p>}
          {match.result && <p className="text-sm font-medium text-[#b5211e]">{match.result}</p>}
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">
            {new Date(match.match_date).toLocaleDateString('en-AU', {
              day: 'numeric', month: 'short', year: 'numeric'
            })}
          </p>
        </div>
      </div>
    </Link>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#262162]">Matches</h1>
        <p className="text-muted-foreground mt-1">{season.name}</p>
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4 space-y-3">
          {upcoming.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No upcoming matches scheduled.
              </CardContent>
            </Card>
          ) : (
            upcoming.map((m: Match) => <MatchCard key={m.id} match={m} />)
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-4 space-y-3">
          {completed.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No completed matches yet.
              </CardContent>
            </Card>
          ) : (
            completed.map((m: Match) => <MatchCard key={m.id} match={m} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
