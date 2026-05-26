import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PLAYER_ROLE_LABELS } from '@/lib/scoring'
import type { MatchPerformance, Player } from '@/types'

const ROLE_BADGE: Record<string, string> = {
  batsman:        'bg-blue-100 text-blue-700',
  bowler:         'bg-[#fceaea] text-[#b5211e]',
  all_rounder:    'bg-[#eeedf8] text-[#262162]',
  wicket_keeper:  'bg-[#fefde8] text-[#262162]',
}

/** Strike-rate bonus. Returns null when not applicable (DNB or < 10 balls). */
function srBonus(runs: number, balls: number, didNotBat: boolean): number | null {
  if (didNotBat || balls < 10) return null
  const sr = (runs / balls) * 100
  if (sr >= 150) return  3
  if (sr >= 125) return  2
  if (sr >= 100) return  1
  if (sr >=  75) return  0
  return -2
}

/** Bowling milestone + maiden + dot-ball bonus. Returns 0 when none applies. */
function bowlBonus(wickets: number, maidens: number, dotBalls: number): number {
  let milestone = 0
  if      (wickets >= 5) milestone = 16
  else if (wickets >= 4) milestone =  8
  else if (wickets >= 3) milestone =  4
  return milestone + maidens * 8 + dotBalls
}

/** Render a bonus number: green positive, red negative, muted zero / null. */
function BonusCell({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span className="text-muted-foreground">—</span>
  if (value > 0) return <span className="font-semibold text-green-600">+{value}</span>
  return <span className="font-semibold text-red-500">{value}</span>
}

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // ── Match ─────────────────────────────────────────────────────────────────
  const { data: match } = await supabase
    .from('matches')
    .select('*')
    .eq('id', id)
    .single()

  if (!match) notFound()

  // ── Performances (public) + optional admin check ──────────────────────────
  const [{ data: performances }, { data: { user } }] = await Promise.all([
    supabase
      .from('match_performances')
      .select('*, players(*)')
      .eq('match_id', id)
      .order('base_points', { ascending: false }),
    supabase.auth.getUser(),
  ])

  // Only fetch profile when a user is actually logged in
  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    isAdmin = profile?.role === 'admin'
  }

  const formattedDate = new Date(match.match_date).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  // ── Helpers ───────────────────────────────────────────────────────────────
  const cell = (v: number | null | undefined) => (v ?? 0) || '—'

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
            <Link href="/matches" className="hover:text-[#262162] hover:underline">Matches</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">Match {match.match_number}</span>
          </div>
          <h1 className="text-3xl font-bold text-[#262162]">{match.opponent}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline">Match {match.match_number}</Badge>
            {match.status === 'completed'
              ? <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">Completed</Badge>
              : <Badge className="bg-[#fefde8] text-[#262162] border border-[#fbf927] hover:bg-[#fefde8]">Upcoming</Badge>
            }
          </div>
          {match.venue   && <p className="text-muted-foreground mt-1">{match.venue}</p>}
          <p className="text-muted-foreground">{formattedDate}</p>
          {match.result  && <p className="text-[#b5211e] font-semibold mt-1">{match.result}</p>}
        </div>

        {isAdmin && (
          <Link
            href={`/admin/matches/${match.id}/stats`}
            className={cn(
              buttonVariants({ variant: match.status === 'completed' ? 'outline' : 'default' }),
              match.status === 'completed'
                ? 'border-[#262162] text-[#262162] hover:bg-[#eeedf8] shrink-0'
                : 'bg-[#262162] hover:bg-[#1a1748] text-white shrink-0',
            )}
          >
            {match.status === 'completed' ? 'Edit Stats' : 'Enter Stats'}
          </Link>
        )}
      </div>

      {/* Scorecard */}
      {match.status === 'completed' && performances && performances.length > 0 ? (
        <Card>
          <CardHeader className="bg-[#262162] rounded-t-xl">
            <CardTitle className="text-white text-base">Player Scorecard</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left   text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3 min-w-[140px]">Player</th>
                    <th className="text-left   text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">Role</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">R</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">B</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">4s</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">6s</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">W</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">Ct</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">St</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">Dots</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">Mdns</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">SR Bonus</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide px-3 py-3">Bowl Bonus</th>
                    <th className="text-right  text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(performances as (MatchPerformance & { players: Player })[]).map((perf) => {
                    const role = perf.players?.role ?? ''
                    return (
                      <tr key={perf.id} className="hover:bg-[#eeedf8] transition-colors">
                        <td className="px-4 py-3 font-medium">
                          {perf.players?.id ? (
                            <Link
                              href={`/players/${perf.players.id}`}
                              className="hover:text-[#262162] hover:underline"
                            >
                              {perf.players.name}
                            </Link>
                          ) : (perf.players?.name ?? '—')}
                        </td>
                        <td className="px-3 py-3">
                          <Badge className={cn('text-xs font-normal', ROLE_BADGE[role] ?? 'bg-gray-100 text-gray-600')}>
                            {PLAYER_ROLE_LABELS[role] ?? role}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {perf.did_not_bat
                            ? <span className="text-muted-foreground text-xs">DNB</span>
                            : <span className="font-medium">{perf.runs_scored}</span>
                          }
                        </td>
                        <td className="px-3 py-3 text-center text-muted-foreground">
                          {perf.did_not_bat ? '—' : (perf.balls_faced ?? 0)}
                        </td>
                        <td className="px-3 py-3 text-center">{cell(perf.fours)}</td>
                        <td className="px-3 py-3 text-center">{cell(perf.sixes)}</td>
                        <td className="px-3 py-3 text-center">{cell(perf.wickets)}</td>
                        <td className="px-3 py-3 text-center">{cell(perf.catches)}</td>
                        <td className="px-3 py-3 text-center">{cell(perf.stumpings)}</td>
                        <td className="px-3 py-3 text-center text-muted-foreground">{cell(perf.dot_balls)}</td>
                        <td className="px-3 py-3 text-center text-muted-foreground">{cell(perf.maidens)}</td>
                        <td className="px-3 py-3 text-center">
                          <BonusCell value={srBonus(perf.runs_scored, perf.balls_faced ?? 0, perf.did_not_bat)} />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <BonusCell value={bowlBonus(perf.wickets ?? 0, perf.maidens ?? 0, perf.dot_balls ?? 0) || null} />
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-[#262162]">
                          {Number(perf.base_points).toFixed(1)}
                        </td>
                      </tr>
                    )
                  })}
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
              <Link
                href={`/admin/matches/${match.id}/stats`}
                className={cn(buttonVariants(), 'mt-4 inline-flex bg-[#262162] hover:bg-[#1a1748]')}
              >
                Enter Player Stats
              </Link>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  )
}
