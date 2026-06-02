import { createClient } from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { buildGameweeks } from '@/lib/gameweeks'
import type { Match } from '@/types'

export default async function ClubMatchesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()
  const base = `/clubs/${slug}`

  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .eq('club_id', club.id)
    .single()

  if (!season) {
    return (
      <div className="text-center py-24">
        <div className="text-5xl mb-4">📅</div>
        <h2 className="text-2xl font-bold text-[#444444]">No Active Season</h2>
      </div>
    )
  }

  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('season_id', season.id)
    .order('match_date', { ascending: true })

  const allMatches: Match[] = matches ?? []
  const gameweeks = buildGameweeks(allMatches)
  const matchById = new Map<string, Match>(allMatches.map((m) => [m.id, m]))

  const activeGw = gameweeks.find((gw) =>
    gw.matchIds.some((id) => matchById.get(id)?.status === 'upcoming')
  )

  if (gameweeks.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[#C9A84C]">Matches</h1>
          <p className="text-muted-foreground mt-1">{season.name}</p>
        </div>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No matches scheduled yet.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#C9A84C]">Matches</h1>
        <p className="text-muted-foreground mt-1">{season.name}</p>
      </div>

      <div className="space-y-8">
        {gameweeks.map((gw) => {
          const isActive = gw.gw === activeGw?.gw
          const gwMatches = gw.matchIds
            .map((id) => matchById.get(id)!)
            .filter(Boolean)
            .sort((a, b) => a.match_number - b.match_number)

          return (
            <div key={gw.dateStr}>
              <div className={`flex items-center gap-3 mb-3 px-1 ${isActive ? 'text-[#C9A84C]' : 'text-gray-500'}`}>
                <div className={`h-px flex-1 ${isActive ? 'bg-[#f0f0f0]' : 'bg-gray-200'}`} />
                <div className="flex items-center gap-2 shrink-0">
                  {isActive && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-[#f0f0f0] text-[#0b0b0b] px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] inline-block" />
                      Current
                    </span>
                  )}
                  <span className={`text-sm font-semibold ${isActive ? 'text-[#C9A84C]' : 'text-gray-500'}`}>
                    Gameweek {gw.gw}
                  </span>
                  <span className={`text-sm ${isActive ? 'text-[#C9A84C]/70' : 'text-gray-400'}`}>— {gw.label}</span>
                </div>
                <div className={`h-px flex-1 ${isActive ? 'bg-[#f0f0f0]' : 'bg-gray-200'}`} />
              </div>

              <div className={`space-y-2 rounded-xl p-3 ${isActive ? 'bg-[#fef9ee] ring-1 ring-[#C9A84C]/50 shadow-[0_0_32px_rgba(201,168,76,0.15)]' : 'bg-transparent'}`}>
                {gwMatches.map((match) => (
                  <Link key={match.id} href={`${base}/matches/${match.id}`}>
                    <div className={`flex items-center justify-between p-4 rounded-lg border bg-[#f0f0f0] hover:bg-[#fef9ee] hover:border-[#C9A84C] transition-colors cursor-pointer group ${isActive ? 'border-[#C9A84C]/20' : 'border-[#d8d8d8]'}`}>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">GW{gw.gw}</Badge><Badge variant="outline" className="text-xs">Match {match.match_number}</Badge>
                          {match.status === 'completed' ? (
                            <Badge className="text-xs bg-[#eeeeee] text-gray-600 hover:bg-[#eeeeee]">Completed</Badge>
                          ) : (
                            <Badge className="text-xs bg-[#fef9ee] text-[#C9A84C] border border-[#C9A84C] hover:bg-[#fef9ee]">Upcoming</Badge>
                          )}
                        </div>
                        <p className="font-semibold text-[#0b0b0b] group-hover:text-[#C9A84C]">{match.opponent}</p>
                        {match.venue  && <p className="text-sm text-muted-foreground">{match.venue}</p>}
                        {match.result && <p className="text-sm font-medium text-[#b5211e]">{match.result}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          {new Date(match.match_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
