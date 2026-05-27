import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { buildGameweeks, type Gameweek } from '@/lib/gameweeks'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtPts(n: number) {
  return n % 1 === 0 ? n.toString() : n.toFixed(1)
}

function initials(name: string | undefined | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

// ── Podium card ────────────────────────────────────────────────────────────────

function PodiumCard({
  rank,
  teamName,
  owner,
  totalPoints,
  isMe,
}: {
  rank: 1 | 2 | 3
  teamName: string
  owner: string
  totalPoints: number
  isMe: boolean
}) {
  const medal    = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'
  const ringCls  =
    rank === 1
      ? 'ring-4 ring-[#C9A84C] shadow-[0_0_24px_rgba(251,249,39,0.35)]'
      : rank === 2
      ? 'ring-2 ring-gray-300 shadow-md'
      : 'ring-2 ring-orange-300 shadow-md'
  const avatarCls =
    rank === 1
      ? 'bg-[#C9A84C] text-[#0b0b0b]'
      : rank === 2
      ? 'bg-gray-200 text-gray-600'
      : 'bg-orange-100 text-orange-700'

  return (
    <div
      className={cn(
        'relative flex flex-col items-center gap-2 rounded-2xl bg-[#f0f0f0] border-2 px-4 py-5 text-center transition-all',
        rank === 1
          ? 'border-[#C9A84C] z-10 scale-105 shadow-xl'
          : rank === 2
          ? 'border-[#d8d8d8]'
          : 'border-orange-200',
        isMe && 'outline outline-2 outline-offset-2 outline-[#C9A84C]',
      )}
    >
      {/* Medal */}
      <span className="text-3xl leading-none">{medal}</span>

      {/* Avatar */}
      <div
        className={cn(
          'w-14 h-14 rounded-full flex items-center justify-center text-base font-black',
          avatarCls,
          ringCls,
        )}
      >
        {initials(owner)}
      </div>

      {/* Names */}
      <div className="min-w-0 w-full">
        <p className="font-bold text-sm text-[#0b0b0b] truncate leading-tight">
          {teamName}
          {isMe && (
            <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded bg-[#C9A84C] text-[#0b0b0b]">
              YOU
            </span>
          )}
        </p>
        <p className="text-xs text-gray-500 truncate">{owner}</p>
      </div>

      {/* Points */}
      <p
        className={cn(
          'font-black tabular-nums leading-none',
          rank === 1 ? 'text-2xl text-[#C9A84C]' : 'text-xl text-[#aaaaaa]',
        )}
      >
        {fmtPts(totalPoints)}
        <span className="text-xs font-normal text-gray-400 ml-1">pts</span>
      </p>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!season) {
    return (
      <div className="text-center py-24">
        <div className="text-5xl mb-4">🏆</div>
        <h2 className="text-2xl font-bold text-[#d4d4d4]">No Active Season</h2>
        <p className="text-gray-500 mt-2">The leaderboard will appear once a season is active.</p>
      </div>
    )
  }

  // ── Data fetching (unchanged from original) ──────────────────────────────
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('*, profiles(display_name)')
    .eq('season_id', season.id)
    .order('total_points', { ascending: false })

  const { data: completedMatches } = await supabase
    .from('matches')
    .select('id, match_number, match_date')
    .eq('season_id', season.id)
    .eq('status', 'completed')
    .order('match_date', { ascending: true })

  const gameweeks         = buildGameweeks(completedMatches ?? [])
  const completedMatchIds = (completedMatches ?? []).map((m) => m.id)

  const { data: allSelections } = completedMatchIds.length > 0
    ? await supabase
        .from('fantasy_selections')
        .select('fantasy_team_id, match_id, points_earned')
        .in('match_id', completedMatchIds)
    : { data: [] }

  const pointsByTeamMatch: Record<string, Record<string, number>> = {}
  for (const sel of allSelections ?? []) {
    if (!pointsByTeamMatch[sel.fantasy_team_id])
      pointsByTeamMatch[sel.fantasy_team_id] = {}
    pointsByTeamMatch[sel.fantasy_team_id][sel.match_id] =
      (pointsByTeamMatch[sel.fantasy_team_id][sel.match_id] ?? 0) + sel.points_earned
  }

  function gwPoints(teamId: string, gw: Gameweek): number {
    const teamMatches = pointsByTeamMatch[teamId] ?? {}
    return gw.matchIds.reduce((sum, mid) => sum + (teamMatches[mid] ?? 0), 0)
  }

  // ── Rank movement (compare current rank to rank before last GW) ──────────
  const prevRankMap = new Map<string, number>()
  if (gameweeks.length >= 2) {
    const prevGws = gameweeks.slice(0, -1)
    const prevScores = (teams ?? [])
      .map((team) => ({
        id:  team.id,
        pts: prevGws.reduce((sum, gw) => sum + gwPoints(team.id, gw), 0),
      }))
      .sort((a, b) => b.pts - a.pts)
    prevScores.forEach((t, i) => prevRankMap.set(t.id, i + 1))
  }

  if (!teams || teams.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-[#C9A84C]">Leaderboard</h1>
        <div className="rounded-2xl bg-[#f0f0f0] border border-[#d8d8d8] p-16 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500">No teams have been created yet. Be the first!</p>
        </div>
      </div>
    )
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const myIdx   = teams.findIndex((t) => t.user_id === user!.id)
  const myRank  = myIdx >= 0 ? myIdx + 1 : null
  const showPin = myRank !== null && myRank > 5   // pin row at bottom if outside top 5

  // Podium: reorder as [#2, #1, #3] for the visual lift effect
  const top3 = teams.slice(0, Math.min(3, teams.length))
  const podiumOrder =
    top3.length === 3
      ? [top3[1], top3[0], top3[2]]
      : top3.length === 2
      ? [top3[1], top3[0]]
      : top3

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-[#f0f0f0] px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#0b0b0b]">Leaderboard</h1>
          <p className="text-[#0b0b0b]/50 text-sm mt-0.5">{season.name}</p>
        </div>
        <div className="text-right">
          <p className="text-[#C9A84C] font-black text-lg">{teams.length}</p>
          <p className="text-[#0b0b0b]/50 text-xs">teams</p>
        </div>
      </div>

      {/* ── Podium ──────────────────────────────────────────────────────── */}
      {top3.length > 0 && (
        <div
          className={cn(
            'grid gap-3 items-end',
            top3.length === 3 ? 'grid-cols-3' :
            top3.length === 2 ? 'grid-cols-2' : 'grid-cols-1',
          )}
        >
          {podiumOrder.map((team) => {
            const rank = teams.indexOf(team) + 1 as 1 | 2 | 3
            const owner = (team.profiles as { display_name: string } | null)?.display_name ?? ''
            return (
              <PodiumCard
                key={team.id}
                rank={rank}
                teamName={team.team_name}
                owner={owner}
                totalPoints={team.total_points}
                isMe={team.user_id === user!.id}
              />
            )
          })}
        </div>
      )}

      {/* ── Full table ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-[#d8d8d8] shadow-sm bg-[#f0f0f0]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">

            {/* Header */}
            <thead>
              <tr className="bg-[#f0f0f0]">
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-[#0b0b0b]/50 px-4 py-3 w-16">
                  Rank
                </th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-[#0b0b0b]/50 px-4 py-3 min-w-[180px]">
                  Team
                </th>
                {gameweeks.map((gw) => (
                  <th
                    key={gw.dateStr}
                    title={gw.label}
                    className="text-center text-[10px] font-bold uppercase tracking-widest text-[#0b0b0b]/50 px-3 py-3 min-w-[56px]"
                  >
                    GW{gw.gw}
                  </th>
                ))}
                <th className="text-right text-[10px] font-bold uppercase tracking-widest text-[#0b0b0b]/50 px-4 py-3 whitespace-nowrap">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {teams.map((team, idx) => {
                const rank    = idx + 1
                const isMe    = team.user_id === user!.id
                const owner   = (team.profiles as { display_name: string } | null)?.display_name ?? ''
                const prevRank = prevRankMap.get(team.id)
                const movement = prevRank != null ? prevRank - rank : null  // positive = up

                return (
                  <TableRow
                    key={team.id}
                    rank={rank}
                    teamName={team.team_name}
                    owner={owner}
                    totalPoints={team.total_points}
                    isMe={isMe}
                    movement={movement}
                    gameweeks={gameweeks}
                    gwPoints={(gw) => gwPoints(team.id, gw)}
                    isEven={idx % 2 === 1}
                  />
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pinned "You" row if outside top 5 */}
        {showPin && myIdx >= 0 && (() => {
          const team     = teams[myIdx]
          const owner    = (team.profiles as { display_name: string } | null)?.display_name ?? ''
          const prevRank = prevRankMap.get(team.id)
          const movement = prevRank != null ? prevRank - (myIdx + 1) : null
          return (
            <div>
              {/* Separator */}
              <div className="flex items-center gap-2 px-4 py-1.5 bg-[#1c1c1c]">
                <div className="h-px flex-1 border-t-2 border-dashed border-[#C9A84C]/25" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#C9A84C]/50">
                  Your position
                </span>
                <div className="h-px flex-1 border-t-2 border-dashed border-[#C9A84C]/25" />
              </div>
              <table className="w-full text-sm">
                <tbody>
                  <TableRow
                    rank={myIdx + 1}
                    teamName={team.team_name}
                    owner={owner}
                    totalPoints={team.total_points}
                    isMe
                    movement={movement}
                    gameweeks={gameweeks}
                    gwPoints={(gw) => gwPoints(team.id, gw)}
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
    </div>
  )
}

// ── Table row component ────────────────────────────────────────────────────────

function TableRow({
  rank,
  teamName,
  owner,
  totalPoints,
  isMe,
  movement,
  gameweeks,
  gwPoints,
  isEven,
  forceHighlight = false,
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
  const rowBg =
    forceHighlight || isMe
      ? 'bg-[#1c1c1c]'
      : isEven
      ? 'bg-[#f8f8f8]/60'
      : 'bg-[#f0f0f0]'

  const rankBadge = (() => {
    if (rank === 1) return <span className="text-xl leading-none">🥇</span>
    if (rank === 2) return <span className="text-xl leading-none">🥈</span>
    if (rank === 3) return <span className="text-xl leading-none">🥉</span>
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#141414] text-gray-600 text-xs font-bold">
        {rank}
      </span>
    )
  })()

  const movementEl = (() => {
    if (movement === null || movement === 0) {
      return <span className="text-gray-300 text-xs font-bold">→</span>
    }
    if (movement > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-green-600 text-[11px] font-bold">
          ↑<span className="tabular-nums">{movement}</span>
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-0.5 text-red-500 text-[11px] font-bold">
        ↓<span className="tabular-nums">{Math.abs(movement)}</span>
      </span>
    )
  })()

  const ownInitials = initials(owner)

  return (
    <tr className={cn('border-b border-[#1e1e1e] last:border-0 transition-colors hover:brightness-[0.97]', rowBg)}>

      {/* Rank + movement */}
      <td className="px-4 py-3">
        <div className="flex flex-col items-center gap-0.5">
          {rankBadge}
          {movementEl}
        </div>
      </td>

      {/* Team + owner */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          {/* Avatar */}
          <div
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0',
              rank === 1
                ? 'bg-[#C9A84C] text-[#0b0b0b]'
                : rank === 2
                ? 'bg-gray-200 text-gray-600'
                : rank === 3
                ? 'bg-orange-100 text-orange-700'
                : isMe
                ? 'bg-[#f0f0f0] text-[#0b0b0b]'
                : 'bg-[#141414] text-gray-500',
            )}
          >
            {ownInitials}
          </div>

          {/* Names */}
          <div className="min-w-0">
            <p className="font-semibold text-sm text-[#0b0b0b] truncate flex items-center gap-1.5">
              {teamName}
              {isMe && (
                <span className="inline-flex items-center px-1.5 py-0 rounded text-[9px] font-black bg-[#C9A84C] text-[#0b0b0b]">
                  YOU
                </span>
              )}
            </p>
            <p className="text-xs text-gray-400 truncate">{owner}</p>
          </div>
        </div>
      </td>

      {/* Gameweek columns */}
      {gameweeks.map((gw) => {
        const pts = gwPoints(gw)
        return (
          <td key={gw.dateStr} className="px-3 py-3 text-center">
            {pts > 0 ? (
              <span className={cn('font-semibold text-sm tabular-nums', isMe ? 'text-[#C9A84C]' : 'text-[#aaaaaa]')}>
                {fmtPts(pts)}
              </span>
            ) : (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </td>
        )
      })}

      {/* Total */}
      <td className="px-4 py-3 text-right">
        <span
          className={cn(
            'font-black tabular-nums text-base',
            rank === 1 ? 'text-[#C9A84C]' : isMe ? 'text-[#C9A84C]' : 'text-[#aaaaaa]',
          )}
        >
          {fmtPts(totalPoints)}
        </span>
      </td>
    </tr>
  )
}
