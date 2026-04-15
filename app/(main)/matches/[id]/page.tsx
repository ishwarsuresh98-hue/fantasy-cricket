import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PLAYER_ROLE_LABELS } from '@/lib/scoring'
import type { MatchPerformance, Player } from '@/types'

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: match } = await supabase
    .from('matches')
    .select('*')
    .eq('id', id)
    .single()

  if (!match) notFound()

  const [{ data: performances }, { data: userResult }] = await Promise.all([
    supabase.from('match_performances').select('*, players(*)').eq('match_id', id).order('base_points', { ascending: false }),
    supabase.auth.getUser(),
  ])

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userResult.user!.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/matches" className="text-sm text-muted-foreground hover:text-[#262162] hover:underline">Matches</Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm">Match {match.match_number}</span>
          </div>
          <h1 className="text-3xl font-bold text-[#262162]">{match.opponent}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">Match {match.match_number}</Badge>
            {match.status === 'completed'
              ? <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">Completed</Badge>
              : <Badge className="bg-[#fefde8] text-[#262162] border border-[#fbf927] hover:bg-[#fefde8]">Upcoming</Badge>
            }
          </div>
          {match.venue && <p className="text-muted-foreground mt-1">{match.venue}</p>}
          <p className="text-muted-foreground">
            {new Date(match.match_date).toLocaleDateString('en-AU', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            })}
          </p>
          {match.result && (
            <p className="text-[#b5211e] font-semibold mt-1">{match.result}</p>
          )}
        </div>
        {isAdmin && (
          <Link
            href={`/admin/matches/${match.id}/stats`}
            className={cn(buttonVariants({ variant: match.status === 'completed' ? 'outline' : 'default' }),
              match.status === 'completed'
                ? 'border-[#262162] text-[#262162] hover:bg-[#eeedf8]'
                : 'bg-[#262162] hover:bg-[#1a1748] text-white'
            )}
          >
            {match.status === 'completed' ? 'Edit Stats' : 'Enter Stats'}
          </Link>
        )}
      </div>

      {match.status === 'completed' && performances && performances.length > 0 ? (
        <Card>
          <CardHeader className="bg-[#262162] rounded-t-xl">
            <CardTitle className="text-white">Player Scorecard</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-6 py-3">Player</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">R</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">B</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">4s</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">6s</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">W</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">Ct</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">St</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-6 py-3">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {performances.map((perf: MatchPerformance & { players: Player }) => (
                    <tr key={perf.id} className="hover:bg-[#eeedf8]">
                      <td className="px-6 py-3">
                        <p className="font-medium text-sm">{perf.players?.name}</p>
                        <p className="text-xs text-muted-foreground">{PLAYER_ROLE_LABELS[perf.players?.role]}</p>
                      </td>
                      <td className="px-3 py-3 text-center text-sm">{perf.did_not_bat ? 'DNB' : perf.runs_scored}</td>
                      <td className="px-3 py-3 text-center text-sm text-muted-foreground">{perf.did_not_bat ? '—' : perf.balls_faced}</td>
                      <td className="px-3 py-3 text-center text-sm">{perf.fours || '—'}</td>
                      <td className="px-3 py-3 text-center text-sm">{perf.sixes || '—'}</td>
                      <td className="px-3 py-3 text-center text-sm">{perf.wickets || '—'}</td>
                      <td className="px-3 py-3 text-center text-sm">{perf.catches || '—'}</td>
                      <td className="px-3 py-3 text-center text-sm">{perf.stumpings || '—'}</td>
                      <td className="px-6 py-3 text-right font-bold text-[#262162]">{perf.base_points.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : match.status === 'upcoming' ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-3">⏳</div>
            <p className="text-muted-foreground">Stats will appear here after the match is completed.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">No performance data entered yet.</p>
            {isAdmin && (
              <Link href={`/admin/matches/${match.id}/stats`} className={cn(buttonVariants(), 'mt-4 inline-flex bg-[#262162] hover:bg-[#1a1748]')}>
                Enter Player Stats
              </Link>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
