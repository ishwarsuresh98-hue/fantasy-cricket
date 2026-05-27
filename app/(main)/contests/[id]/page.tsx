import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import ShareCodeButton from '@/components/contests/ShareCodeButton'
import { buildGameweeks, type Gameweek } from '@/lib/gameweeks'
import type { Contest, ContestEntry } from '@/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtPts(n: number) { return n % 1 === 0 ? n.toString() : n.toFixed(1) }

function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function ContestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── Contest ───────────────────────────────────────────────────────────────
  const { data: contest } = await supabase
    .from('contests')
    .select('*')
    .eq('id', id)
    .single()

  if (!contest) notFound()

  const c = contest as Contest

  // ── Season ────────────────────────────────────────────────────────────────
  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('id', c.season_id)
    .single()

  // ── Members (entries + team info + owner) ─────────────────────────────────
  const { data: entries } = await supabase
    .from('contest_entries')
    .select('fantasy_team_id, joined_at')
    .eq('contest_id', id)

  const teamIds = (entries ?? []).map((e: { fantasy_team_id: string }) => e.fantasy_team_id)

  const { data: teams } = teamIds.length > 0
    ? await supabase
        .from('fantasy_teams')
        .select('id, team_name, total_points, user_id, profiles(display_name)')
        .in('id', teamIds)
        .order('total_points', { ascending: false })
    : { data: [] }

  // ── My team ───────────────────────────────────────────────────────────────
  const myTeam = (teams ?? []).find((t: { user_id: string }) => t.user_id === user!.id)
  const isMember = !!myTeam
  const myIdx    = isMember ? (teams ?? []).findIndex((t: { user_id: string }) => t.user_id === user!.id) : -1
  const myRank   = myIdx >= 0 ? myIdx + 1 : null
  const showPin  = myRank !== null && myRank > 5

  // ── GW data (same logic as /leaderboard) ─────────────────────────────────
  const { data: completedMatches } = await supabase
    .from('matches')
    .select('id, match_date')
    .eq('season_id', c.season_id)
    .eq('status', 'completed')
    .order('match_date', { ascending: true })

  const gameweeks         = buildGameweeks(completedMatches ?? [])
  const completedMatchIds = (completedMatches ?? []).map((m) => m.id)

  const { data: allSelections } = completedMatchIds.length > 0 && teamIds.length > 0
    ? await supabase
        .from('fantasy_selections')
        .select('fantasy_team_id, match_id, points_earned')
        .in('match_id', completedMatchIds)
        .in('fantasy_team_id', teamIds)
    : { data: [] }

  const pointsByTeamMatch: Record<string, Record<string, number>> = {}
  for (const sel of allSelections ?? []) {
    if (!pointsByTeamMatch[sel.fantasy_team_id]) pointsByTeamMatch[sel.fantasy_team_id] = {}
    pointsByTeamMatch[sel.fantasy_team_id][sel.match_id] =
      (pointsByTeamMatch[sel.fantasy_team_id][sel.match_id] ?? 0) + sel.points_earned
  }

  function gwPts(teamId: string, gw: Gameweek): number {
    const m = pointsByTeamMatch[teamId] ?? {}
    return gw.matchIds.reduce((sum, mid) => sum + (m[mid] ?? 0), 0)
  }

  // ── Previous GW rank (for movement arrow) ────────────────────────────────
  const prevRankMap = new Map<string, number>()
  if (gameweeks.length >= 2) {
    const prevGws = gameweeks.slice(0, -1)
    const prevScores = (teams ?? [])
      .map((t: { id: string; total_points: number }) => ({
        id:  t.id,
        pts: prevGws.reduce((sum, gw) => sum + gwPts(t.id, gw), 0),
      }))
      .sort((a: { pts: number }, b: { pts: number }) => b.pts - a.pts)
    prevScores.forEach((t: { id: string }, i: number) => prevRankMap.set(t.id, i + 1))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/contests" className="hover:text-[#C9A84C] hover:underline">Contests</Link>
        <span>/</span>
        <span className="text-[#d4d4d4] font-medium truncate">{c.name}</span>
      </div>

      {/* ── Contest header ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-[#f0f0f0] px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              'text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full',
              c.type === 'private' ? 'bg-[#C9A84C] text-[#0b0b0b]' : 'bg-[#f5f5f5]/20 text-[#0b0b0b]',
            )}>
              {c.type === 'private' ? '🔒 Private League' : '🌐 Public Contest'}
            </span>
          </div>
          <h1 className="text-2xl font-black text-[#0b0b0b] truncate">{c.name}</h1>
          {season && <p className="text-[#0b0b0b]/50 text-sm mt-0.5">{season.name}</p>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-center">
            <p className="text-[#C9A84C] font-black text-xl tabular-nums">{(teams ?? []).length}</p>
            <p className="text-[#0b0b0b]/50 text-xs">/ {c.max_teams} teams</p>
          </div>
          {/* Share code — only shown to members */}
          {isMember && c.type === 'private' && c.entry_code && (
            <ShareCodeButton code={c.entry_code} />
          )}
        </div>
      </div>

      {/* ── Prize card ─────────────────────────────────────────────────────── */}
      {c.prize_description && (
        <div className="rounded-2xl bg-[#fef9ee] border-2 border-[#C9A84C]/60 px-5 py-4 flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">🏆</span>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#C9A84C]/60 mb-0.5">Prize Pool</p>
            <p className="text-sm text-[#d4d4d4] leading-relaxed">{c.prize_description}</p>
          </div>
        </div>
      )}

      {/* ── No members ─────────────────────────────────────────────────────── */}
      {(teams ?? []).length === 0 ? (
        <div className="rounded-2xl bg-[#f0f0f0] border border-[#d8d8d8] p-16 text-center">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-gray-500">No teams have joined yet.</p>
          {c.type === 'private' && c.entry_code && (
            <p className="text-xs text-gray-400 mt-2">
              Share invite code <span className="font-black tracking-[0.2em] font-mono text-[#C9A84C]">{c.entry_code}</span> to get started.
            </p>
          )}
        </div>
      ) : (
        /* ── Leaderboard table ─────────────────────────────────────────────── */
        <div className="rounded-2xl overflow-hidden border border-[#d8d8d8] shadow-sm bg-[#f0f0f0]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f0f0f0]">
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-[#0b0b0b]/50 px-4 py-3 w-16">Rank</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-[#0b0b0b]/50 px-4 py-3 min-w-[180px]">Team</th>
                  {gameweeks.map((gw) => (
                    <th
                      key={gw.dateStr}
                      title={gw.label}
                      className="text-center text-[10px] font-bold uppercase tracking-widest text-[#0b0b0b]/50 px-3 py-3 min-w-[52px]"
                    >
                      GW{gw.gw}
                    </th>
                  ))}
                  <th className="text-right text-[10px] font-bold uppercase tracking-widest text-[#0b0b0b]/50 px-4 py-3">Total</th>
                </tr>
              </thead>

              <tbody>
                {(teams ?? []).map((team: Record<string, unknown>, idx: number) => {
                  const rank      = idx + 1
                  const isMe      = (team.user_id as string) === user!.id
                  const owner     = (team.profiles as { display_name: string } | null)?.display_name ?? ''
                  const prevRank  = prevRankMap.get(team.id as string)
                  const movement  = prevRank != null ? prevRank - rank : null
                  return (
                    <LeaderboardRow
                      key={team.id as string}
                      rank={rank}
                      teamName={team.team_name as string}
                      owner={owner}
                      totalPoints={team.total_points as number}
                      isMe={isMe}
                      movement={movement}
                      gameweeks={gameweeks}
                      gwPoints={(gw) => gwPts(team.id as string, gw)}
                      isEven={idx % 2 === 1}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pinned user row */}
          {showPin && myIdx >= 0 && (() => {
            const team    = (teams ?? [])[myIdx] as Record<string, unknown>
            const owner   = (team.profiles as { display_name: string } | null)?.display_name ?? ''
            const prevRnk = prevRankMap.get(team.id as string)
            const mvmt    = prevRnk != null ? prevRnk - (myIdx + 1) : null
            return (
              <div>
                <div className="flex items-center gap-2 px-4 py-1.5 bg-[#1c1c1c]">
                  <div className="h-px flex-1 border-t-2 border-dashed border-[#C9A84C]/25" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#C9A84C]/50">Your position</span>
                  <div className="h-px flex-1 border-t-2 border-dashed border-[#C9A84C]/25" />
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    <LeaderboardRow
                      rank={myIdx + 1}
                      teamName={team.team_name as string}
                      owner={owner}
                      totalPoints={team.total_points as number}
                      isMe
                      movement={mvmt}
                      gameweeks={gameweeks}
                      gwPoints={(gw) => gwPts(team.id as string, gw)}
                      isEven={false}
                      forceHighlight
                    />
                  </tbody>
                </table>
              </div>
            )
          })()}

          {/* GW date key */}
          {gameweeks.length > 0 && (
            <div className="border-t border-[#1e1e1e] px-4 py-3 flex flex-wrap gap-x-4 gap-y-1">
              {gameweeks.map((gw) => (
                <span key={gw.dateStr} className="text-xs text-gray-400">
                  <span className="font-semibold text-gray-600">GW{gw.gw}</span> = {gw.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Leaderboard row (shared with main leaderboard style) ──────────────────────

function LeaderboardRow({
  rank, teamName, owner, totalPoints, isMe, movement,
  gameweeks, gwPoints, isEven, forceHighlight = false,
}: {
  rank:           number
  teamName:       string
  owner:          string
  totalPoints:    number
  isMe:           boolean
  movement:       number | null
  gameweeks:      Gameweek[]
  gwPoints:       (gw: Gameweek) => number
  isEven:         boolean
  forceHighlight?: boolean
}) {
  const rowBg = forceHighlight || isMe ? 'bg-[#1c1c1c]' : isEven ? 'bg-[#f8f8f8]/60' : 'bg-[#f0f0f0]'

  const rankBadge =
    rank === 1 ? <span className="text-xl">🥇</span> :
    rank === 2 ? <span className="text-xl">🥈</span> :
    rank === 3 ? <span className="text-xl">🥉</span> : (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#141414] text-gray-600 text-xs font-bold">
        {rank}
      </span>
    )

  const movementEl =
    movement === null || movement === 0
      ? <span className="text-gray-300 text-xs">→</span>
      : movement > 0
      ? <span className="text-green-600 text-[11px] font-bold">↑{movement}</span>
      : <span className="text-red-500 text-[11px] font-bold">↓{Math.abs(movement)}</span>

  const avatarCls =
    rank === 1 ? 'bg-[#C9A84C] text-[#0b0b0b]' :
    rank === 2 ? 'bg-gray-200 text-gray-600' :
    rank === 3 ? 'bg-orange-100 text-orange-700' :
    isMe ? 'bg-[#f0f0f0] text-[#0b0b0b]' : 'bg-[#141414] text-gray-500'

  return (
    <tr className={cn('border-b border-[#1e1e1e] last:border-0 hover:brightness-[0.97] transition-colors', rowBg)}>
      <td className="px-4 py-3">
        <div className="flex flex-col items-center gap-0.5">{rankBadge}{movementEl}</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0', avatarCls)}>
            {initials(owner)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-[#0b0b0b] truncate flex items-center gap-1.5">
              {teamName}
              {isMe && <span className="text-[9px] font-black px-1.5 py-0 rounded bg-[#C9A84C] text-[#0b0b0b]">YOU</span>}
            </p>
            <p className="text-xs text-gray-400 truncate">{owner}</p>
          </div>
        </div>
      </td>
      {gameweeks.map((gw) => {
        const pts = gwPoints(gw)
        return (
          <td key={gw.dateStr} className="px-3 py-3 text-center">
            {pts > 0
              ? <span className={cn('font-semibold text-sm tabular-nums', isMe ? 'text-[#C9A84C]' : 'text-[#aaaaaa]')}>{fmtPts(pts)}</span>
              : <span className="text-gray-300 text-xs">—</span>
            }
          </td>
        )
      })}
      <td className="px-4 py-3 text-right">
        <span className={cn('font-black tabular-nums text-base', isMe ? 'text-[#C9A84C]' : 'text-[#aaaaaa]')}>
          {fmtPts(totalPoints)}
        </span>
      </td>
    </tr>
  )
}
