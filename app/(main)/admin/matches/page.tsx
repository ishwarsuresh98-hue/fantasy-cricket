import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Match } from '@/types'
import MatchForm from '@/components/admin/MatchForm'

const MAX_XI = 11

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

  // Fetch Playing XI counts for all upcoming matches in one query
  const upcomingIds = (matches ?? [])
    .filter((m: Match) => m.status === 'upcoming')
    .map((m: Match) => m.id)

  const { data: xiRows } = upcomingIds.length > 0
    ? await supabase
        .from('match_playing_xi')
        .select('match_id')
        .in('match_id', upcomingIds)
    : { data: [] }

  // Count confirmed players per match
  const xiCounts: Record<string, number> = {}
  for (const row of xiRows ?? []) {
    xiCounts[row.match_id] = (xiCounts[row.match_id] ?? 0) + 1
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#262162]">Matches</h2>
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
                <div key={match.id} className="flex items-center justify-between px-6 py-4 hover:bg-[#eeedf8] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[3rem] bg-[#262162] text-white rounded-lg py-1.5">
                      <p className="text-xs opacity-70">Match</p>
                      <p className="font-bold text-lg leading-none">{match.match_number}</p>
                    </div>
                    <div>
                      <p className="font-semibold">{match.opponent}</p>
                      {match.venue && <p className="text-sm text-muted-foreground">{match.venue}</p>}
                      <p className="text-sm text-muted-foreground">
                        {new Date(match.match_date).toLocaleDateString('en-AU', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </p>
                      {match.result && <p className="text-sm font-medium text-[#b5211e] mt-0.5">{match.result}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Badge className={
                      match.status === 'completed'
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-100'
                        : 'bg-[#fefde8] text-[#262162] border border-[#fbf927] hover:bg-[#fefde8]'
                    }>
                      {match.status === 'completed' ? 'Completed' : 'Upcoming'}
                    </Badge>

                    {/* Playing XI button — only for upcoming matches */}
                    {match.status === 'upcoming' && (() => {
                      const xiCount = xiCounts[match.id] ?? 0
                      const xiComplete = xiCount === MAX_XI
                      return (
                        <Link
                          href={`/admin/matches/${match.id}/playing-xi`}
                          className={cn(
                            buttonVariants({ variant: 'outline', size: 'sm' }),
                            'gap-1.5',
                            xiComplete
                              ? 'border-green-500 text-green-700 hover:bg-green-50'
                              : xiCount > 0
                              ? 'border-amber-400 text-amber-700 hover:bg-amber-50'
                              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                          )}
                        >
                          {xiComplete ? (
                            <>✓ Playing XI</>
                          ) : xiCount > 0 ? (
                            <>🟡 XI ({xiCount}/{MAX_XI})</>
                          ) : (
                            <>🟢 Set Playing XI</>
                          )}
                        </Link>
                      )
                    })()}

                    <Link
                      href={`/admin/matches/${match.id}/stats`}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'border-[#262162] text-[#262162] hover:bg-[#eeedf8]')}
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
