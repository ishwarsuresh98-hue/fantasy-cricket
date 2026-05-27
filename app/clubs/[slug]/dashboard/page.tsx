import { createClient } from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { BOOSTERS } from '@/lib/boosters'
import { computeMatchDayLockWindow } from '@/lib/deadline'
import { buildGameweeks } from '@/lib/gameweeks'
import HeroCountdown from '@/components/HeroCountdown'
import PushPermissionButton from '@/components/push/PushPermissionButton'
import type { Match, Season, TeamBooster, FantasyTeam } from '@/types'

function fmtPts(n: number) {
  return n % 1 === 0 ? n.toString() : n.toFixed(1)
}

export default async function ClubDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: season }, { data: profile }] = await Promise.all([
    supabase.from('seasons').select('*').eq('is_active', true).eq('club_id', club.id).single(),
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
  ])

  const base = `/clubs/${slug}`

  if (!season) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="text-5xl">🏏</div>
        <h2 className="text-2xl font-bold text-[#d4d4d4]">No Active Season</h2>
        <p className="text-gray-500">An admin needs to create and activate a season to get started.</p>
        {profile?.role === 'admin' && (
          <Link
            href={`${base}/admin`}
            className="mt-2 px-5 py-2.5 rounded-lg bg-[#111111] hover:bg-[#0a0a0a] text-white font-semibold text-sm transition-colors"
          >
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

  const upcomingMatches  = (matches ?? []).filter((m: Match) => m.status === 'upcoming')
  const completedMatches = (matches ?? []).filter((m: Match) => m.status === 'completed')
  const nextMatch        = upcomingMatches[0] as Match | undefined

  const { data: boosterUsage } = myTeam
    ? await supabase.from('team_boosters').select('*').eq('fantasy_team_id', myTeam.id)
    : { data: [] }

  let pointsByTeamMatch: Record<string, Record<string, number>> = {}
  if (completedMatches.length > 0 && allTeams && allTeams.length > 0) {
    const completedIds = completedMatches.map((m: Match) => m.id)
    const { data: breakdownSels } = await supabase
      .from('fantasy_selections')
      .select('fantasy_team_id, match_id, points_earned')
      .in('match_id', completedIds)
    for (const sel of breakdownSels ?? []) {
      if (!pointsByTeamMatch[sel.fantasy_team_id]) pointsByTeamMatch[sel.fantasy_team_id] = {}
      pointsByTeamMatch[sel.fantasy_team_id][sel.match_id] =
        (pointsByTeamMatch[sel.fantasy_team_id][sel.match_id] ?? 0) + sel.points_earned
    }
  }

  const gameweeks = buildGameweeks(completedMatches)

  function gwPoints(teamId: string, matchIds: string[]): number {
    const teamMap = pointsByTeamMatch[teamId] ?? {}
    return matchIds.reduce((sum, mid) => sum + (teamMap[mid] ?? 0), 0)
  }

  const lockWindow = computeMatchDayLockWindow(upcomingMatches)
  const deadline   = lockWindow?.lockStart ?? null
  const lockUntil  = lockWindow?.lockEnd.toISOString() ?? null

  const myRank = allTeams?.findIndex((t) => t.user_id === user!.id) ?? -1
  const rank   = myRank >= 0 ? myRank + 1 : null

  let teamValue = 0
  if (myTeam) {
    const refMatchId =
      nextMatch?.id ?? completedMatches[completedMatches.length - 1]?.id
    if (refMatchId) {
      const { data: squadSels } = await supabase
        .from('fantasy_selections')
        .select('players(price)')
        .eq('fantasy_team_id', myTeam.id)
        .eq('match_id', refMatchId)
      teamValue = (squadSels ?? []).reduce((sum: number, s: unknown) => {
        const sel = s as { players: { price: number } | null }
        return sum + (sel.players?.price ?? 0)
      }, 0)
    }
  }

  const lastGw       = gameweeks[gameweeks.length - 1] ?? null
  const myLastGwPts  = myTeam && lastGw ? gwPoints(myTeam.id, lastGw.matchIds) : 0

  const lastGwAvg = (() => {
    if (!lastGw || !allTeams || allTeams.length === 0) return 0
    const total = (allTeams as FantasyTeam[]).reduce(
      (sum, t) => sum + gwPoints(t.id, lastGw.matchIds),
      0,
    )
    return total / allTeams.length
  })()

  let lastGwTopScorer: { name: string; points: number } | null = null
  if (myTeam && lastGw) {
    const { data: topSels } = await supabase
      .from('fantasy_selections')
      .select('points_earned, players(name)')
      .eq('fantasy_team_id', myTeam.id)
      .in('match_id', lastGw.matchIds)
      .order('points_earned', { ascending: false })
      .limit(1)
    const top = (topSels ?? [])[0] as { points_earned: number; players: unknown } | undefined
    if (top && top.points_earned > 0) {
      lastGwTopScorer = {
        name:   (top.players as { name: string } | null)?.name ?? 'Unknown',
        points: top.points_earned,
      }
    }
  }

  const myGwHistory = gameweeks.map((gw) => ({
    gw:    gw.gw,
    label: gw.label,
    pts:   myTeam ? gwPoints(myTeam.id, gw.matchIds) : 0,
  }))
  const maxGwPts = Math.max(...myGwHistory.map((g) => g.pts), 1)

  const nextMatchLabel = nextMatch ? `vs ${nextMatch.opponent}` : null
  const nextMatchDate  = nextMatch
    ? new Date(nextMatch.match_date).toLocaleDateString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  return (
    <div className="space-y-5">

      {/* ── Hero card ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-[#111111] px-6 py-6 shadow-xl">
        <div className="pointer-events-none absolute inset-0 opacity-5">
          <div className="absolute left-1/2 top-0 bottom-0 w-[12%] -translate-x-1/2 bg-[#111111] rounded-sm" />
          <div className="absolute inset-x-[8%] top-[30%] h-px bg-[#111111]" />
          <div className="absolute inset-x-[8%] bottom-[30%] h-px bg-[#111111]" />
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            {myTeam ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/40">{s.name}</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight truncate">
                  {myTeam.team_name}
                </h1>
                <p className="text-sm text-white/60 mt-0.5">{profile?.display_name ?? 'You'}</p>
                {rank !== null && (
                  <div className="mt-3 inline-flex items-center gap-2">
                    <span className={cn(
                      'inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-black',
                      rank === 1 ? 'bg-[#C9A84C] text-[#C9A84C]' :
                      rank === 2 ? 'bg-gray-300 text-[#aaaaaa]' :
                      rank === 3 ? 'bg-orange-300 text-orange-900' :
                      'bg-[#111111]/20 text-white',
                    )}>
                      {rank === 1 ? '🥇 ' : rank === 2 ? '🥈 ' : rank === 3 ? '🥉 ' : ''}
                      #{rank} of {allTeams?.length ?? 1}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <h1 className="text-2xl font-black text-white">Welcome!</h1>
                <p className="text-white/60 text-sm mt-1">You haven't created a team yet.</p>
              </>
            )}
          </div>

          <div className="flex flex-row sm:flex-col items-center sm:items-end gap-4 sm:gap-2 flex-shrink-0">
            {myTeam ? (
              <>
                <div className="text-center sm:text-right">
                  <p className="text-5xl sm:text-6xl font-black text-[#C9A84C] tabular-nums leading-none">
                    {fmtPts(myTeam.total_points)}
                  </p>
                  <p className="text-xs font-bold uppercase tracking-widest text-white/50 mt-1">Total Points</p>
                </div>
                {teamValue > 0 && (
                  <div className="text-center sm:text-right">
                    <p className="text-lg font-bold text-white/80">
                      {teamValue.toFixed(1)} <span className="text-sm font-normal text-white/50">cr</span>
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-white/40">Team Value</p>
                  </div>
                )}
              </>
            ) : (
              <Link
                href={`${base}/team`}
                className="px-5 py-3 rounded-xl bg-[#C9A84C] text-[#C9A84C] font-black text-sm hover:bg-yellow-300 transition-colors"
              >
                Create Team →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Middle row: countdown + last GW ──────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-5">
        <HeroCountdown
          deadline={deadline?.toISOString() ?? null}
          lockUntil={lockUntil}
          matchLabel={nextMatchLabel ?? undefined}
          matchDate={nextMatchDate ?? undefined}
        />

        {lastGw ? (
          <div className="rounded-2xl bg-[#111111] border border-[#2a2a2a] shadow-sm p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Last Gameweek — GW{lastGw.gw}
                </p>
                <p className="text-[11px] text-gray-400">{lastGw.label}</p>
              </div>
              <Badge className="bg-[#1c1c1c] text-[#C9A84C] hover:bg-[#1c1c1c] font-semibold">GW{lastGw.gw}</Badge>
            </div>
            <div>
              <p className="text-4xl font-black text-[#C9A84C] tabular-nums leading-none">
                {fmtPts(myLastGwPts)}
                <span className="text-base font-normal text-gray-400 ml-1">pts</span>
              </p>
              {myTeam && <p className="text-xs text-gray-400 mt-0.5">{myTeam.team_name}</p>}
            </div>
            {allTeams && allTeams.length > 1 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-medium text-gray-500">
                  <span>You</span>
                  <span>League avg {fmtPts(Math.round(lastGwAvg))}</span>
                </div>
                <div className="h-3 bg-[#141414] rounded-full overflow-hidden flex">
                  {(() => {
                    const max   = Math.max(myLastGwPts, lastGwAvg, 1)
                    const myW   = (myLastGwPts / max) * 100
                    const avgW  = (lastGwAvg / max) * 100
                    const ahead = myLastGwPts >= lastGwAvg
                    return (
                      <>
                        <div
                          className={cn('h-full rounded-l-full transition-all', ahead ? 'bg-green-500' : 'bg-[#111111]')}
                          style={{ width: `${myW}%` }}
                        />
                        <div className="h-full bg-gray-300" style={{ width: `${Math.max(0, avgW - myW)}%` }} />
                      </>
                    )
                  })()}
                </div>
                <p className={cn('text-[11px] font-semibold', myLastGwPts >= lastGwAvg ? 'text-green-600' : 'text-gray-500')}>
                  {myLastGwPts >= lastGwAvg
                    ? `+${fmtPts(myLastGwPts - lastGwAvg)} above average`
                    : `${fmtPts(lastGwAvg - myLastGwPts)} below average`}
                </p>
              </div>
            )}
            {lastGwTopScorer && (
              <div className="flex items-center gap-2.5 bg-[#1c1c1c] rounded-xl px-3 py-2.5">
                <span className="text-lg">⭐</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#C9A84C]/60">Top scorer</p>
                  <p className="text-sm font-bold text-[#C9A84C] truncate">
                    {lastGwTopScorer.name}
                    <span className="ml-1.5 text-[#b5211e] font-black">{fmtPts(lastGwTopScorer.points)} pts</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-[#111111] border border-[#2a2a2a] shadow-sm p-5 flex flex-col items-center justify-center gap-2 min-h-[200px]">
            <span className="text-3xl">📊</span>
            <p className="text-sm font-semibold text-[#aaaaaa]">No results yet</p>
            <p className="text-xs text-gray-400 text-center">GW summaries will appear once matches are completed.</p>
          </div>
        )}
      </div>

      {/* ── Quick action buttons ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Make Transfers', icon: '🔄', href: `${base}/team`,        primary: true  },
          { label: 'Leaderboard',    icon: '🏆', href: `${base}/teams`,       primary: false },
          { label: 'My Team',        icon: '🏏', href: `${base}/team`,        primary: false },
        ].map(({ label, icon, href, primary }) => (
          <Link
            key={label}
            href={href}
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 px-2 text-center font-bold text-sm transition-all active:scale-95 select-none',
              primary
                ? 'bg-[#111111] text-white hover:bg-[#0a0a0a] shadow-md shadow-[#C9A84C]/10'
                : 'bg-[#111111] border border-[#2a2a2a] text-[#aaaaaa] hover:border-[#C9A84C]/40 hover:bg-[#1c1c1c]',
            )}
          >
            <span className="text-2xl">{icon}</span>
            <span className="leading-tight text-xs sm:text-sm">{label}</span>
          </Link>
        ))}
      </div>

      {/* ── GW form strip ─────────────────────────────────────────────────── */}
      {myGwHistory.length > 0 && (
        <div className="rounded-2xl bg-[#111111] border border-[#2a2a2a] shadow-sm p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Recent Form</p>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {myGwHistory.map((gw) => {
              const barH     = gw.pts > 0 ? Math.max(20, Math.round((gw.pts / maxGwPts) * 100)) : 0
              const isLast   = gw.gw === myGwHistory[myGwHistory.length - 1].gw
              const barColor = gw.pts === 0 ? 'bg-gray-200' :
                gw.pts >= maxGwPts * 0.75 ? 'bg-green-500' :
                gw.pts >= maxGwPts * 0.4  ? 'bg-[#C9A84C]' : 'bg-orange-400'
              return (
                <div
                  key={gw.gw}
                  className={cn(
                    'flex-shrink-0 flex flex-col items-center gap-2 px-3 py-3 rounded-xl border-2 min-w-[72px] transition-colors',
                    isLast ? 'border-[#C9A84C] bg-[#1c1c1c]' : 'border-transparent bg-[#0f0f0f]',
                  )}
                >
                  <div className="flex items-end justify-center h-10 w-full">
                    <div className={cn('w-5 rounded-t-sm transition-all', barColor)} style={{ height: gw.pts > 0 ? `${barH}%` : '4px' }} />
                  </div>
                  <p className={cn('text-base font-black tabular-nums leading-none', isLast ? 'text-[#C9A84C]' : 'text-[#aaaaaa]')}>
                    {gw.pts > 0 ? fmtPts(gw.pts) : '—'}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">GW{gw.gw}</p>
                  <p className="text-[9px] text-gray-400 text-center leading-tight hidden sm:block">{gw.label}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Boosters ────────────────────────────────────────────────────── */}
      {myTeam && (
        <div className="rounded-2xl bg-[#111111] border border-[#2a2a2a] shadow-sm p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Boosters</p>
          <div className="flex flex-wrap gap-2">
            {BOOSTERS.map((booster) => {
              const used      = (boosterUsage ?? []).filter((b: TeamBooster) => b.booster_type === booster.type).length
              const remaining = Math.max(0, booster.maxUses - used)
              const exhausted = remaining === 0
              return (
                <Link key={booster.type} href={`${base}/team`}>
                  <div className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                    exhausted
                      ? 'border-[#2a2a2a] bg-[#0f0f0f] text-gray-400'
                      : 'border-[#C9A84C]/20 bg-[#1c1c1c] text-[#C9A84C] hover:bg-[#1a1a1a]',
                  )}>
                    <span>{booster.icon}</span>
                    <span>{booster.name}</span>
                    <span className={cn('ml-1 font-bold', exhausted ? 'text-gray-400' : 'text-[#C9A84C]')}>
                      {exhausted ? 'Used' : `${remaining}/${booster.maxUses}`}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── GW points breakdown table ────────────────────────────────────── */}
      {gameweeks.length > 0 && allTeams && allTeams.length > 0 && (
        <div className="rounded-2xl bg-[#111111] border border-[#2a2a2a] shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Gameweek Breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-[#1e1e1e] bg-[#0f0f0f]">
                  <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide min-w-[140px]">Team</th>
                  {gameweeks.map((gw) => (
                    <th key={gw.dateStr} title={gw.label} className="text-center px-3 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide min-w-[52px]">
                      GW{gw.gw}
                    </th>
                  ))}
                  <th className="text-right px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(allTeams as FantasyTeam[]).map((team) => {
                  const isMe = team.user_id === user!.id
                  return (
                    <tr key={team.id} className={isMe ? 'bg-[#1c1c1c]' : 'hover:bg-[#0f0f0f] transition-colors'}>
                      <td className="px-5 py-3 font-medium text-[#d4d4d4]">
                        <span className="truncate block max-w-[160px]">{team.team_name}</span>
                        {isMe && (
                          <Badge className="mt-0.5 bg-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C] text-[10px] px-1.5">You</Badge>
                        )}
                      </td>
                      {gameweeks.map((gw) => {
                        const pts = gwPoints(team.id, gw.matchIds)
                        return (
                          <td key={gw.dateStr} className="px-3 py-3 text-center">
                            {pts > 0
                              ? <span className={cn('font-semibold', isMe ? 'text-[#C9A84C]' : 'text-[#aaaaaa]')}>{fmtPts(pts)}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                        )
                      })}
                      <td className={cn('px-5 py-3 text-right font-bold', isMe ? 'text-[#C9A84C]' : 'text-[#aaaaaa]')}>
                        {fmtPts(team.total_points)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[#1e1e1e] px-5 py-3 flex flex-wrap gap-x-4 gap-y-1">
            {gameweeks.map((gw) => (
              <span key={gw.dateStr} className="text-xs text-gray-400">
                <span className="font-semibold text-gray-600">GW{gw.gw}</span> = {gw.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <PushPermissionButton />
    </div>
  )
}
