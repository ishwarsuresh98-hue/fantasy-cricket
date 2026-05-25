import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { BOOSTERS } from '@/lib/boosters'
import { computeMatchDayLockWindow } from '@/lib/deadline'
import { buildGameweeks } from '@/lib/gameweeks'
import HeroCountdown from '@/components/HeroCountdown'
import type { Match, Season, TeamBooster, FantasyTeam } from '@/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtPts(n: number) {
  return n % 1 === 0 ? n.toString() : n.toFixed(1)
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: season }, { data: profile }] = await Promise.all([
    supabase.from('seasons').select('*').eq('is_active', true).single(),
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
  ])

  if (!season) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="text-5xl">🏏</div>
        <h2 className="text-2xl font-bold text-gray-800">No Active Season</h2>
        <p className="text-gray-500">An admin needs to create and activate a season to get started.</p>
        {profile?.role === 'admin' && (
          <Link
            href="/admin"
            className="mt-2 px-5 py-2.5 rounded-lg bg-[#262162] hover:bg-[#1a1748] text-white font-semibold text-sm transition-colors"
          >
            Go to Admin Panel
          </Link>
        )}
      </div>
    )
  }

  const s = season as Season

  // ── Core data ─────────────────────────────────────────────────────────────
  const [{ data: matches }, { data: myTeam }, { data: allTeams }] = await Promise.all([
    supabase.from('matches').select('*').eq('season_id', s.id).order('match_date'),
    supabase.from('fantasy_teams').select('*').eq('season_id', s.id).eq('user_id', user!.id).single(),
    supabase.from('fantasy_teams').select('*').eq('season_id', s.id).order('total_points', { ascending: false }),
  ])

  const upcomingMatches  = (matches ?? []).filter((m: Match) => m.status === 'upcoming')
  const completedMatches = (matches ?? []).filter((m: Match) => m.status === 'completed')
  const nextMatch        = upcomingMatches[0] as Match | undefined

  // ── Booster usage ─────────────────────────────────────────────────────────
  const { data: boosterUsage } = myTeam
    ? await supabase.from('team_boosters').select('*').eq('fantasy_team_id', myTeam.id)
    : { data: [] }

  // ── Per-match points breakdown ────────────────────────────────────────────
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

  // ── Gameweeks ─────────────────────────────────────────────────────────────
  const gameweeks = buildGameweeks(completedMatches)

  function gwPoints(teamId: string, matchIds: string[]): number {
    const teamMap = pointsByTeamMatch[teamId] ?? {}
    return matchIds.reduce((sum, mid) => sum + (teamMap[mid] ?? 0), 0)
  }

  // ── Deadline / lock window ────────────────────────────────────────────────
  const lockWindow = computeMatchDayLockWindow(upcomingMatches)
  const deadline   = lockWindow?.lockStart ?? null
  const lockUntil  = lockWindow?.lockEnd.toISOString() ?? null

  // ── Rank ──────────────────────────────────────────────────────────────────
  const myRank = allTeams?.findIndex((t) => t.user_id === user!.id) ?? -1
  const rank   = myRank >= 0 ? myRank + 1 : null

  // ── Team value (sum of selected players' credits for next/most-recent match) ─
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

  // ── Last GW summary ───────────────────────────────────────────────────────
  const lastGw       = gameweeks[gameweeks.length - 1] ?? null
  const myLastGwPts  = myTeam && lastGw ? gwPoints(myTeam.id, lastGw.matchIds) : 0

  // League average for last GW
  const lastGwAvg = (() => {
    if (!lastGw || !allTeams || allTeams.length === 0) return 0
    const total = (allTeams as FantasyTeam[]).reduce(
      (sum, t) => sum + gwPoints(t.id, lastGw.matchIds),
      0,
    )
    return total / allTeams.length
  })()

  // Top scorer from my team in the last GW
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

  // My GW-by-GW points history
  const myGwHistory = gameweeks.map((gw) => ({
    gw:    gw.gw,
    label: gw.label,
    pts:   myTeam ? gwPoints(myTeam.id, gw.matchIds) : 0,
  }))
  const maxGwPts = Math.max(...myGwHistory.map((g) => g.pts), 1)

  // Next match display strings
  const nextMatchLabel = nextMatch
    ? `vs ${nextMatch.opponent}`
    : null
  const nextMatchDate = nextMatch
    ? new Date(nextMatch.match_date).toLocaleDateString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Hero card ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-[#262162] px-6 py-6 shadow-xl">
        {/* Subtle pitch lines in background */}
        <div className="pointer-events-none absolute inset-0 opacity-5">
          <div className="absolute left-1/2 top-0 bottom-0 w-[12%] -translate-x-1/2 bg-white rounded-sm" />
          <div className="absolute inset-x-[8%] top-[30%] h-px bg-white" />
          <div className="absolute inset-x-[8%] bottom-[30%] h-px bg-white" />
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Left: team info */}
          <div className="min-w-0">
            {myTeam ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/40">
                    {s.name}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight truncate">
                  {myTeam.team_name}
                </h1>
                <p className="text-sm text-white/60 mt-0.5">
                  {profile?.display_name ?? 'You'}
                </p>

                {/* Rank badge */}
                {rank !== null && (
                  <div className="mt-3 inline-flex items-center gap-2">
                    <span className={cn(
                      'inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-black',
                      rank === 1
                        ? 'bg-[#fbf927] text-[#262162]'
                        : rank === 2
                        ? 'bg-gray-300 text-gray-700'
                        : rank === 3
                        ? 'bg-orange-300 text-orange-900'
                        : 'bg-white/20 text-white',
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

          {/* Right: big points display */}
          <div className="flex flex-row sm:flex-col items-center sm:items-end gap-4 sm:gap-2 flex-shrink-0">
            {myTeam ? (
              <>
                <div className="text-center sm:text-right">
                  <p className="text-5xl sm:text-6xl font-black text-[#fbf927] tabular-nums leading-none">
                    {fmtPts(myTeam.total_points)}
                  </p>
                  <p className="text-xs font-bold uppercase tracking-widest text-white/50 mt-1">
                    Total Points
                  </p>
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
                href="/team"
                className="px-5 py-3 rounded-xl bg-[#fbf927] text-[#262162] font-black text-sm hover:bg-yellow-300 transition-colors"
              >
                Create Team →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Middle row: countdown + last GW ───────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-5">

        {/* Countdown */}
        <HeroCountdown
          deadline={deadline?.toISOString() ?? null}
          lockUntil={lockUntil}
          matchLabel={nextMatchLabel ?? undefined}
          matchDate={nextMatchDate ?? undefined}
        />

        {/* Last GW summary */}
        {lastGw ? (
          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Last Gameweek — GW{lastGw.gw}
                </p>
                <p className="text-[11px] text-gray-400">{lastGw.label}</p>
              </div>
              <Badge className="bg-[#eeedf8] text-[#262162] hover:bg-[#eeedf8] font-semibold">
                GW{lastGw.gw}
              </Badge>
            </div>

            {/* My GW score */}
            <div>
              <p className="text-4xl font-black text-[#262162] tabular-nums leading-none">
                {fmtPts(myLastGwPts)}
                <span className="text-base font-normal text-gray-400 ml-1">pts</span>
              </p>
              {myTeam && (
                <p className="text-xs text-gray-400 mt-0.5">{myTeam.team_name}</p>
              )}
            </div>

            {/* vs League average bar */}
            {allTeams && allTeams.length > 1 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-medium text-gray-500">
                  <span>You</span>
                  <span>League avg {fmtPts(Math.round(lastGwAvg))}</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
                  {(() => {
                    const max     = Math.max(myLastGwPts, lastGwAvg, 1)
                    const myW     = (myLastGwPts / max) * 100
                    const avgW    = (lastGwAvg / max) * 100
                    const ahead   = myLastGwPts >= lastGwAvg
                    return (
                      <>
                        <div
                          className={cn(
                            'h-full rounded-l-full transition-all',
                            ahead ? 'bg-green-500' : 'bg-[#262162]',
                          )}
                          style={{ width: `${myW}%` }}
                        />
                        <div
                          className="h-full bg-gray-300"
                          style={{ width: `${Math.max(0, avgW - myW)}%` }}
                        />
                      </>
                    )
                  })()}
                </div>
                <p className={cn(
                  'text-[11px] font-semibold',
                  myLastGwPts >= lastGwAvg ? 'text-green-600' : 'text-gray-500',
                )}>
                  {myLastGwPts >= lastGwAvg
                    ? `+${fmtPts(myLastGwPts - lastGwAvg)} above average`
                    : `${fmtPts(lastGwAvg - myLastGwPts)} below average`}
                </p>
              </div>
            )}

            {/* Top scorer */}
            {lastGwTopScorer && (
              <div className="flex items-center gap-2.5 bg-[#eeedf8] rounded-xl px-3 py-2.5">
                <span className="text-lg">⭐</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#262162]/60">
                    Top scorer
                  </p>
                  <p className="text-sm font-bold text-[#262162] truncate">
                    {lastGwTopScorer.name}
                    <span className="ml-1.5 text-[#b5211e] font-black">
                      {fmtPts(lastGwTopScorer.points)} pts
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* No completed matches yet */
          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5 flex flex-col items-center justify-center gap-2 min-h-[200px]">
            <span className="text-3xl">📊</span>
            <p className="text-sm font-semibold text-gray-700">No results yet</p>
            <p className="text-xs text-gray-400 text-center">GW summaries will appear once matches are completed.</p>
          </div>
        )}
      </div>

      {/* ── Quick action buttons ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Make Transfers', icon: '🔄', href: '/team',        primary: true  },
          { label: 'Leaderboard',    icon: '🏆', href: '/teams',       primary: false },
          { label: 'My Team',        icon: '🏏', href: '/team',        primary: false },
        ].map(({ label, icon, href, primary }) => (
          <Link
            key={label}
            href={href}
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 px-2 text-center font-bold text-sm transition-all active:scale-95 select-none',
              primary
                ? 'bg-[#262162] text-white hover:bg-[#1a1748] shadow-md shadow-[#262162]/20'
                : 'bg-white border border-gray-200 text-gray-700 hover:border-[#262162]/40 hover:bg-[#eeedf8]',
            )}
          >
            <span className="text-2xl">{icon}</span>
            <span className="leading-tight text-xs sm:text-sm">{label}</span>
          </Link>
        ))}
      </div>

      {/* ── GW form strip ──────────────────────────────────────────────────── */}
      {myGwHistory.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
            Recent Form
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {myGwHistory.map((gw) => {
              const barH     = gw.pts > 0 ? Math.max(20, Math.round((gw.pts / maxGwPts) * 100)) : 0
              const isLast   = gw.gw === myGwHistory[myGwHistory.length - 1].gw
              const barColor = gw.pts === 0
                ? 'bg-gray-200'
                : gw.pts >= maxGwPts * 0.75
                ? 'bg-green-500'
                : gw.pts >= maxGwPts * 0.4
                ? 'bg-[#fbf927]'
                : 'bg-orange-400'
              return (
                <div
                  key={gw.gw}
                  className={cn(
                    'flex-shrink-0 flex flex-col items-center gap-2 px-3 py-3 rounded-xl border-2 min-w-[72px] transition-colors',
                    isLast
                      ? 'border-[#262162] bg-[#eeedf8]'
                      : 'border-transparent bg-gray-50',
                  )}
                >
                  {/* Mini bar */}
                  <div className="flex items-end justify-center h-10 w-full">
                    <div
                      className={cn('w-5 rounded-t-sm transition-all', barColor)}
                      style={{ height: gw.pts > 0 ? `${barH}%` : '4px' }}
                    />
                  </div>

                  <p className={cn(
                    'text-base font-black tabular-nums leading-none',
                    isLast ? 'text-[#262162]' : 'text-gray-700',
                  )}>
                    {gw.pts > 0 ? fmtPts(gw.pts) : '—'}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    GW{gw.gw}
                  </p>
                  <p className="text-[9px] text-gray-400 text-center leading-tight hidden sm:block">
                    {gw.label}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Boosters ───────────────────────────────────────────────────────── */}
      {myTeam && (
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
            Boosters
          </p>
          <div className="flex flex-wrap gap-2">
            {BOOSTERS.map((booster) => {
              const used      = (boosterUsage ?? []).filter(
                (b: TeamBooster) => b.booster_type === booster.type,
              ).length
              const remaining = Math.max(0, booster.maxUses - used)
              const exhausted = remaining === 0
              return (
                <Link key={booster.type} href="/team">
                  <div
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                      exhausted
                        ? 'border-gray-200 bg-gray-50 text-gray-400'
                        : 'border-[#262162]/20 bg-[#eeedf8] text-[#262162] hover:bg-[#dddcf5]',
                    )}
                  >
                    <span>{booster.icon}</span>
                    <span>{booster.name}</span>
                    <span className={cn('ml-1 font-bold', exhausted ? 'text-gray-400' : 'text-[#262162]')}>
                      {exhausted ? 'Used' : `${remaining}/${booster.maxUses}`}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── GW points breakdown table ──────────────────────────────────────── */}
      {gameweeks.length > 0 && allTeams && allTeams.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Gameweek Breakdown
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide min-w-[140px]">
                    Team
                  </th>
                  {gameweeks.map((gw) => (
                    <th
                      key={gw.dateStr}
                      title={gw.label}
                      className="text-center px-3 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide min-w-[52px]"
                    >
                      GW{gw.gw}
                    </th>
                  ))}
                  <th className="text-right px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(allTeams as FantasyTeam[]).map((team) => {
                  const isMe = team.user_id === user!.id
                  return (
                    <tr
                      key={team.id}
                      className={isMe ? 'bg-[#eeedf8]' : 'hover:bg-gray-50 transition-colors'}
                    >
                      <td className="px-5 py-3 font-medium text-gray-800">
                        <span className="truncate block max-w-[160px]">{team.team_name}</span>
                        {isMe && (
                          <Badge className="mt-0.5 bg-[#fbf927] text-[#262162] hover:bg-[#fbf927] text-[10px] px-1.5">
                            You
                          </Badge>
                        )}
                      </td>
                      {gameweeks.map((gw) => {
                        const pts = gwPoints(team.id, gw.matchIds)
                        return (
                          <td key={gw.dateStr} className="px-3 py-3 text-center">
                            {pts > 0
                              ? <span className={cn('font-semibold', isMe ? 'text-[#262162]' : 'text-gray-700')}>
                                  {fmtPts(pts)}
                                </span>
                              : <span className="text-gray-300 text-xs">—</span>
                            }
                          </td>
                        )
                      })}
                      <td className={cn(
                        'px-5 py-3 text-right font-bold',
                        isMe ? 'text-[#262162]' : 'text-gray-700',
                      )}>
                        {fmtPts(team.total_points)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* GW date key */}
          <div className="border-t border-gray-100 px-5 py-3 flex flex-wrap gap-x-4 gap-y-1">
            {gameweeks.map((gw) => (
              <span key={gw.dateStr} className="text-xs text-gray-400">
                <span className="font-semibold text-gray-600">GW{gw.gw}</span> = {gw.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
