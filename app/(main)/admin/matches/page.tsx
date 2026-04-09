import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Match } from '@/types'
import MatchForm from '@/components/admin/MatchForm'

export default async function AdminMatchesPage() {
  const supabase = await createClient()

  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!season) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Create an active season first before adding matches.</p>
      </div>
    )
  }

  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('season_id', season.id)
    .order('match_number')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Matches</h2>
          <p className="text-muted-foreground">{season.name} • {matches?.length ?? 0} matches</p>
        </div>
        <MatchForm seasonId={season.id} nextMatchNumber={(matches?.length ?? 0) + 1} />
      </div>

      {(!matches || matches.length === 0) ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-3">📅</div>
            <p className="text-muted-foreground">No matches scheduled yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {matches.map((match: Match) => (
                <div key={match.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[3rem]">
                      <p className="text-xs text-muted-foreground">Match</p>
                      <p className="font-bold text-lg">{match.match_number}</p>
                    </div>
                    <div>
                      <p className="font-semibold">vs {match.opponent}</p>
                      {match.venue && <p className="text-sm text-muted-foreground">{match.venue}</p>}
                      <p className="text-sm text-muted-foreground">
                        {new Date(match.match_date).toLocaleDateString('en-AU', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </p>
                      {match.result && <p className="text-sm font-medium text-emerald-700 mt-0.5">{match.result}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={
                      match.status === 'completed'
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-100'
                        : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                    }>
                      {match.status === 'completed' ? 'Completed' : 'Upcoming'}
                    </Badge>
                    <Link
                      href={`/admin/matches/${match.id}/stats`}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                    >
                      {match.status === 'completed' ? 'Edit Stats' : 'Enter Stats'}
                    </Link>
                    <MatchForm seasonId={season.id} match={match} nextMatchNumber={match.match_number} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
