import { createClient } from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import { notFound } from 'next/navigation'
import { BOOSTERS } from '@/lib/boosters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { TeamBooster } from '@/types'

export default async function ClubAdminBoostersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()

  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .eq('club_id', club.id)
    .single()

  if (!season) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">No active season.</p>
      </div>
    )
  }

  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, team_name, user_id, profiles(display_name)')
    .eq('season_id', season.id)
    .order('team_name')

  const teamIds = (teams ?? []).map((t) => t.id)
  const { data: allBoosters } = teamIds.length
    ? await supabase
        .from('team_boosters')
        .select('*, matches(match_number)')
        .in('fantasy_team_id', teamIds)
    : { data: [] }

  const boostersByTeam = (allBoosters ?? []).reduce(
    (acc: Record<string, TeamBooster[]>, b) => {
      if (!acc[b.fantasy_team_id]) acc[b.fantasy_team_id] = []
      acc[b.fantasy_team_id].push(b)
      return acc
    },
    {}
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#C9A84C]">Booster Usage</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{season.name}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Booster Definitions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {BOOSTERS.map((b) => (
              <div key={b.type} className="flex items-start gap-2 text-sm">
                <span className="text-lg">{b.icon}</span>
                <div>
                  <p className="font-medium text-xs">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.maxUses}× per season</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {!teams || teams.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No fantasy teams found for this season.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[#f8f8f8]">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Team</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Owner</th>
                  {BOOSTERS.map((b) => (
                    <th key={b.type} className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                      {b.icon} {b.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(teams ?? []).map((team) => {
                  const teamBoosters = boostersByTeam[team.id] ?? []
                  const profile = Array.isArray(team.profiles) ? team.profiles[0] : team.profiles

                  return (
                    <tr key={team.id} className="hover:bg-[#f8f8f8] transition-colors">
                      <td className="px-4 py-3 font-medium">{team.team_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {(profile as { display_name?: string } | null)?.display_name ?? '—'}
                      </td>
                      {BOOSTERS.map((booster) => {
                        const uses = teamBoosters.filter((b) => b.booster_type === booster.type)
                        const used = uses.length
                        const remaining = Math.max(0, booster.maxUses - used)
                        return (
                          <td key={booster.type} className="px-3 py-3 text-center">
                            {used === 0 ? (
                              <Badge
                                variant="secondary"
                                className="text-xs font-normal text-gray-400 bg-[#eeeeee]"
                              >
                                {remaining}/{booster.maxUses}
                              </Badge>
                            ) : (
                              <div className="space-y-1">
                                {uses.map((u, i) => {
                                  const matchInfo = u as TeamBooster & { matches?: { match_number: number } }
                                  return (
                                    <Badge
                                      key={i}
                                      className="bg-[#fef9ee] text-[#C9A84C] border border-[#C9A84C] hover:bg-[#fef9ee] text-xs block"
                                    >
                                      M{matchInfo.matches?.match_number ?? '?'}
                                    </Badge>
                                  )
                                })}
                                {remaining > 0 && (
                                  <span className="text-xs text-muted-foreground">{remaining} left</span>
                                )}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
