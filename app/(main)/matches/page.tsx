import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { buildGameweeks } from '@/lib/gameweeks'
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
    .order('match_date', { ascending: true })

  const allMatches: Match[] = matches ?? []

  // ── Build gameweeks from all matches (upcoming + completed) ───────────────
  const gameweeks = buildGameweeks(allMatches)

  // Lookup: matchId → Match object
  const matchById = new Map<string, Match>(allMatches.map((m) => [m.id, m]))

  // The active gameweek = first GW that still has at least one upcoming match
  const activeGw = gameweeks.find((gw) =>
    gw.matchIds.some((id) => matchById.get(id)?.status === 'upcoming')
  )

  if (gameweeks.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[#262162]">Matches</h1>
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
        <h1 className="text-3xl font-bold text-[#262162]">Matches</h1>
        <p className="text-muted-foreground mt-1">{season.name}</p>
      </div>

      <div className="space-y-8">
        {gameweeks.map((gw) => {
          const isActive = gw.gw === activeGw?.gw

          // Matches in this GW, sorted by match_number
          const gwMatches = gw.matchIds
            .map((id) => matchById.get(id)!)
            .filter(Boolean)
            .sort((a, b) => a.match_number - b.match_number)

          return (
            <div key={gw.dateStr}>
              {/* Gameweek header */}
              <div
                className={`flex items-center gap-3 mb-3 px-1 ${
                  isActive ? 'text-[#262162]' : 'text-gray-500'
                }`}
              >
                <div
                  className={`h-px flex-1 ${
                    isActive ? 'bg-[#262162]' : 'bg-gray-200'
                  }`}
                />
                <div className="flex items-center gap-2 shrink-0">
                  {isActive && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-[#262162] text-white px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#fbf927] inline-block" />
                      Current
                    </span>
                  )}
                  <span className={`text-sm font-semibold ${isActive ? 'text-[#262162]' : 'text-gray-500'}`}>
                    Gameweek {gw.gw}
                  </span>
                  <span className={`text-sm ${isActive ? 'text-[#262162]/70' : 'text-gray-400'}`}>
                    — {gw.label}
                  </span>
                </div>
                <div
                  className={`h-px flex-1 ${
                    isActive ? 'bg-[#262162]' : 'bg-gray-200'
                  }`}
                />
              </div>

              {/* Match cards for this GW */}
              <div
                className={`space-y-2 rounded-xl p-3 ${
                  isActive
                    ? 'bg-[#eeedf8] ring-1 ring-[#262162]/20'
                    : 'bg-transparent'
                }`}
              >
                {gwMatches.map((match) => (
                  <Link key={match.id} href={`/matches/${match.id}`}>
                    <div className={`flex items-center justify-between p-4 rounded-lg border bg-white hover:bg-[#eeedf8] hover:border-[#262162] transition-colors cursor-pointer group ${
                      isActive ? 'border-[#262162]/20' : 'border-gray-200'
                    }`}>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            Match {match.match_number}
                          </Badge>
                          {match.status === 'completed' ? (
                            <Badge className="text-xs bg-gray-100 text-gray-600 hover:bg-gray-100">
                              Completed
                            </Badge>
                          ) : (
                            <Badge className="text-xs bg-[#fefde8] text-[#262162] border border-[#fbf927] hover:bg-[#fefde8]">
                              Upcoming
                            </Badge>
                          )}
                        </div>
                        <p className="font-semibold text-gray-900 group-hover:text-[#262162]">
                          {match.opponent}
                        </p>
                        {match.venue && (
                          <p className="text-sm text-muted-foreground">{match.venue}</p>
                        )}
                        {match.result && (
                          <p className="text-sm font-medium text-[#b5211e]">{match.result}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          {new Date(match.match_date).toLocaleDateString('en-AU', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
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
