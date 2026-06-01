import { createClient } from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Match } from '@/types'
import MatchForm from '@/components/admin/MatchForm'
import DeleteMatchButton from '@/components/admin/DeleteMatchButton'
import GenerateContestsButton   from '@/components/admin/GenerateContestsButton'
import GenerateGWContestsButton from '@/components/admin/GenerateGWContestsButton'

const MAX_XI = 11

export default async function ClubAdminMatchesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()
  const base = `/clubs/${slug}/admin`

  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .eq('club_id', club.id)
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

  const upcomingIds = (matches ?? [])
    .filter((m: Match) => m.status === 'upcoming')
    .map((m: Match) => m.id)

  const { data: xiRows } = upcomingIds.length > 0
    ? await supabase
        .from('match_playing_xi')
        .select('match_id')
        .in('match_id', upcomingIds)
    : { data: [] }

  const xiCounts: Record<string, number> = {}
  for (const row of xiRows ?? []) {
    xiCounts[row.match_id] = (xiCounts[row.match_id] ?? 0) + 1
  }

  // ── Gameweek lookup: match_id → gameweek row ──────────────────────────────
  const allMatchIds = (matches ?? []).map((m: Match) => m.id)
  const { data: gwRows } = allMatchIds.length > 0
    ? await supabase
        .from('gameweeks')
        .select('id, number, name, match_id')
        .eq('season_id', season.id)
        .in('match_id', allMatchIds)
    : { data: [] }

  const gwByMatch: Record<string, { id: string; name: string; number: number }> = {}
  for (const gw of gwRows ?? []) {
    if (gw.match_id) gwByMatch[gw.match_id] = { id: gw.id, name: gw.name, number: gw.number }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#C9A84C]">Matches</h2>
          <p className="text-muted-foreground">{season.name} • {matches?.length ?? 0} matches</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`${base}/matches/import`}
            className={cn(buttonVariants({ variant: 'outline' }), 'border-[#C9A84C] text-[#C9A84C] hover:bg-[#fef9ee]')}
          >
            Import Matches
          </Link>
          <MatchForm seasonId={season.id} nextMatchNumber={(matches?.length ?? 0) + 1} />
        </div>
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
                <div key={match.id} className="flex items-center justify-between px-6 py-4 hover:bg-[#fef9ee] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[3rem] bg-[#f0f0f0] text-[#0b0b0b] rounded-lg py-1.5">
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
                        ? 'bg-[#141414] text-[#aaaaaa] hover:bg-[#141414]'
                        : 'bg-[#fef9ee] text-[#C9A84C] border border-[#C9A84C] hover:bg-[#fef9ee]'
                    }>
                      {match.status === 'completed' ? 'Completed' : 'Upcoming'}
                    </Badge>

                    {match.status === 'upcoming' && (() => {
                      const xiCount = xiCounts[match.id] ?? 0
                      const xiComplete = xiCount === MAX_XI
                      return (
                        <Link
                          href={`${base}/matches/${match.id}/playing-xi`}
                          className={cn(
                            buttonVariants({ variant: 'outline', size: 'sm' }),
                            'gap-1.5',
                            xiComplete
                              ? 'border-green-500 text-green-700 hover:bg-green-50'
                              : xiCount > 0
                              ? 'border-[#C9A84C] text-[#C9A84C] hover:bg-[#fef9ee]'
                              : 'border-gray-300 text-gray-600 hover:bg-[#f8f8f8]'
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
                      href={`${base}/matches/${match.id}/stats`}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'border-[#C9A84C] text-[#C9A84C] hover:bg-[#fef9ee]')}
                    >
                      {match.status === 'completed' ? 'Edit Stats' : 'Enter Stats'}
                    </Link>
                    {match.status === 'upcoming' && (
                      <GenerateContestsButton
                        matchId={match.id}
                        matchLabel={`GW${match.match_number} vs ${match.opponent}`}
                      />
                    )}
                    {match.status === 'upcoming' && gwByMatch[match.id] && (
                      <GenerateGWContestsButton
                        gameweekId={gwByMatch[match.id].id}
                        gameweekLabel={`${gwByMatch[match.id].name} vs ${match.opponent}`}
                      />
                    )}
                    <MatchForm seasonId={season.id} match={match} nextMatchNumber={match.match_number} />
                    <DeleteMatchButton
                      matchId={match.id}
                      matchLabel={`Match ${match.match_number} vs ${match.opponent}`}
                    />
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
