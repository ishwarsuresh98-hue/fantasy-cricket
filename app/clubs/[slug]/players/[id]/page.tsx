import { createClient } from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { PLAYER_ROLE_LABELS } from '@/lib/scoring'

const ROLE_AVATAR: Record<string, string> = {
  batsman:       'bg-blue-500',
  bowler:        'bg-[#b5211e]',
  all_rounder:   'bg-[#4f46e5]',
  wicket_keeper: 'bg-amber-400',
}
const ROLE_HERO_BADGE: Record<string, string> = {
  batsman:       'bg-blue-500/20 text-blue-200',
  bowler:        'bg-red-500/20 text-red-200',
  all_rounder:   'bg-purple-500/20 text-purple-200',
  wicket_keeper: 'bg-amber-400/20 text-amber-200',
}

function fmtPts(n: number) { return n % 1 === 0 ? n.toString() : n.toFixed(1) }
function initials(name: string) { return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') }
function barColor(pts: number): string {
  if (pts >= 80) return '#22c55e'
  if (pts >= 40) return '#fbf927'
  if (pts > 0)   return '#f97316'
  return '#d1d5db'
}

export default async function ClubPlayerProfilePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()
  const base = `/clubs/${slug}`

  const { data: player } = await supabase.from('players').select('*').eq('id', id).single()
  if (!player) notFound()

  const { data: allMatches } = await supabase
    .from('matches').select('id, match_number, match_date, opponent, status')
    .eq('season_id', player.season_id).eq('status', 'completed').order('match_number', { ascending: true })

  const { data: performances } = await supabase
    .from('match_performances')
    .select('match_id, runs_scored, balls_faced, fours, sixes, wickets, catches, stumpings, maidens, dot_balls, run_outs, did_not_bat, base_points')
    .eq('player_id', id)

  const { data: creditHistory } = await supabase
    .from('player_credit_history').select('match_id, credit_before, credit_after')
    .eq('player_id', id).order('created_at')

  const { data: upcomingMatch } = await supabase
    .from('matches').select('id').eq('season_id', player.season_id).eq('status', 'upcoming')
    .order('match_date', { ascending: true }).limit(1).maybeSingle()

  const refMatchId = upcomingMatch?.id ?? allMatches?.[allMatches.length - 1]?.id ?? null

  const [{ data: ownershipRows }, { count: totalTeams }] = await Promise.all([
    refMatchId
      ? supabase
          .from('fantasy_selections')
          .select('fantasy_team_id, is_captain, is_vice_captain, fantasy_teams(id, team_name, total_points, profiles(display_name))')
          .eq('player_id', id).eq('match_id', refMatchId)
      : Promise.resolve({ data: [] }),
    supabase.from('fantasy_teams').select('*', { count: 'exact', head: true }).eq('season_id', player.season_id),
  ])

  const matches = allMatches ?? []
  const perfs   = performances ?? []
  const history = creditHistory ?? []

  const perfByMatch = new Map(perfs.map((p) => [p.match_id, p]))
  const histByMatch = new Map(history.map((h) => [h.match_id, h]))

  const playedPerfs   = perfs.filter((p) => !p.did_not_bat || (p.wickets ?? 0) > 0 || (p.catches ?? 0) > 0)
  const totalPoints   = perfs.reduce((s, p) => s + (p.base_points ?? 0), 0)
  const avgPoints     = playedPerfs.length > 0 ? totalPoints / playedPerfs.length : 0
  const highScore     = perfs.reduce((m, p) => Math.max(m, p.base_points ?? 0), 0)
  const matchesPlayed = playedPerfs.length
  const totalRuns     = perfs.filter((p) => !p.did_not_bat).reduce((s, p) => s + (p.runs_scored ?? 0), 0)
  const totalWickets  = perfs.reduce((s, p) => s + (p.wickets ?? 0), 0)

  const latestHist = history[history.length - 1]
  const creditTrend = latestHist
    ? latestHist.credit_after > latestHist.credit_before ? 'up'
    : latestHist.credit_after < latestHist.credit_before ? 'down' : 'neutral'
    : 'neutral'

  const owners = (ownershipRows ?? []) as unknown as {
    fantasy_team_id: string; is_captain: boolean; is_vice_captain: boolean
    fantasy_teams: { id: string; team_name: string; total_points: number; profiles: { display_name: string } | null } | null
  }[]
  const ownerCount = owners.length
  const ownerPct   = totalTeams && totalTeams > 0 ? Math.round((ownerCount / totalTeams) * 100) : 0

  const chartData = matches.map((m) => ({
    label: `M${m.match_number}`, pts: Math.round(perfByMatch.get(m.id)?.base_points ?? 0), played: perfByMatch.has(m.id),
  }))
  const maxPts  = Math.max(...chartData.map((d) => d.pts), 1)
  const BAR_W   = 28; const BAR_GAP = 6; const CHART_H = 100
  const chartW  = chartData.length * (BAR_W + BAR_GAP)
  const matchesDesc = [...matches].reverse()

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href={`${base}/matches`} className="hover:text-[#262162] hover:underline">Players</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium truncate">{player.name}</span>
      </div>

      {/* Hero card */}
      <div className="rounded-2xl bg-[#262162] px-6 py-6 flex items-center gap-5">
        <div className={cn('w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black text-white flex-shrink-0', ROLE_AVATAR[player.role] ?? 'bg-gray-500')}>
          {initials(player.name)}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black text-white truncate">{player.name}</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={cn('text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full', ROLE_HERO_BADGE[player.role] ?? 'bg-white/10 text-white')}>
              {PLAYER_ROLE_LABELS[player.role] ?? player.role}
            </span>
            {ownerCount > 0 && (
              <span className="text-[10px] font-bold text-white/60 bg-white/10 px-2 py-0.5 rounded-full">
                👥 {ownerCount} of {totalTeams ?? '?'} teams ({ownerPct}%)
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-3">
            {totalRuns > 0 && <div><p className="text-[#fbf927] font-black text-lg tabular-nums leading-tight">{totalRuns}</p><p className="text-white/40 text-[10px] uppercase tracking-wide">Runs</p></div>}
            {totalWickets > 0 && <div><p className="text-[#fbf927] font-black text-lg tabular-nums leading-tight">{totalWickets}</p><p className="text-white/40 text-[10px] uppercase tracking-wide">Wickets</p></div>}
            <div><p className="text-[#fbf927] font-black text-lg tabular-nums leading-tight">{Math.round(totalPoints)}</p><p className="text-white/40 text-[10px] uppercase tracking-wide">Total Pts</p></div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-white/40 text-xs uppercase tracking-wide mb-0.5">Credits</p>
          <div className="flex items-center gap-1 justify-end">
            <span className="text-4xl font-black text-white tabular-nums">{Number(player.price).toFixed(1)}</span>
            {creditTrend === 'up'   && <span className="text-green-400 text-xl font-bold">↑</span>}
            {creditTrend === 'down' && <span className="text-red-400  text-xl font-bold">↓</span>}
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3">
        {[{ label: 'Total Pts', value: Math.round(totalPoints) }, { label: 'Avg / Match', value: avgPoints.toFixed(1) }, { label: 'Best Score', value: Math.round(highScore) }, { label: 'Matches', value: matchesPlayed }].map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-white border border-gray-200 p-4 text-center shadow-sm">
            <p className="text-xl font-black text-[#262162] tabular-nums">{value}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Form bar chart */}
      {chartData.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-[#262162]">Points per Match</p>
            <div className="flex items-center gap-3 text-[10px] text-gray-400">
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500" />80+</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#fbf927]" />40+</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-400" />&lt;40</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-200" />DNP</span>
            </div>
          </div>
          <div className="overflow-x-auto px-5 pb-4">
            <svg width={Math.max(chartW, 320)} height={CHART_H + 24} className="block">
              {chartData.map((d, i) => {
                const x    = i * (BAR_W + BAR_GAP)
                const barH = d.played && d.pts > 0 ? Math.max(4, Math.round((d.pts / maxPts) * CHART_H)) : 4
                const y    = CHART_H - barH
                const fill = d.played ? barColor(d.pts) : '#d1d5db'
                return (
                  <g key={i}>
                    <rect x={x} y={y} width={BAR_W} height={barH} rx={4} fill={fill} />
                    {d.played && d.pts > 0 && <text x={x + BAR_W / 2} y={y - 4} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#374151">{d.pts}</text>}
                    <text x={x + BAR_W / 2} y={CHART_H + 16} textAnchor="middle" fontSize={9} fill="#9ca3af">{d.label}</text>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Match log table */}
      {matches.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100"><p className="text-sm font-bold text-[#262162]">Match Log</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['#', 'Opponent', 'R', 'B', '4s', '6s', 'W', 'Ct', 'Mdns', 'Pts', 'Cr'].map((h, i) => (
                    <th key={h} className={cn('text-[10px] font-bold uppercase tracking-widest text-gray-400 py-3',
                      i === 0 ? 'px-5 text-left' : i === 1 ? 'px-4 text-left' : i === 10 ? 'px-5 text-right' : 'px-3 text-center')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {matchesDesc.map((m) => {
                  const p = perfByMatch.get(m.id); const h = histByMatch.get(m.id)
                  const dnp = !p; const dnb = p?.did_not_bat
                  return (
                    <tr key={m.id} className={cn('transition-colors hover:bg-[#eeedf8]', dnp ? 'opacity-40' : '')}>
                      <td className="px-5 py-2.5 text-xs font-bold text-gray-400 tabular-nums">{m.match_number}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[140px] truncate">
                        <Link href={`${base}/matches/${m.id}`} className="hover:text-[#262162] hover:underline">{m.opponent}</Link>
                      </td>
                      {dnp ? (
                        <td colSpan={8} className="px-3 py-2.5 text-center text-xs text-gray-400 italic">Did not play</td>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 text-center">{dnb ? <span className="text-gray-300 text-xs">DNB</span> : <span className="font-medium">{p!.runs_scored ?? 0}</span>}</td>
                          <td className="px-3 py-2.5 text-center text-gray-500">{dnb ? '—' : (p!.balls_faced ?? '—')}</td>
                          <td className="px-3 py-2.5 text-center text-gray-500">{p!.fours    || '—'}</td>
                          <td className="px-3 py-2.5 text-center text-gray-500">{p!.sixes    || '—'}</td>
                          <td className="px-3 py-2.5 text-center">{(p!.wickets ?? 0) > 0 ? <span className="font-semibold text-[#b5211e]">{p!.wickets}</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-center text-gray-500">{p!.catches  || '—'}</td>
                          <td className="px-3 py-2.5 text-center text-gray-500">{p!.maidens  || '—'}</td>
                          <td className="px-3 py-2.5 text-center"><span className="font-black text-[#262162] tabular-nums">{fmtPts(p!.base_points ?? 0)}</span></td>
                        </>
                      )}
                      <td className="px-5 py-2.5 text-right text-xs tabular-nums">
                        {h ? (
                          <span className={cn('font-semibold',
                            h.credit_after > h.credit_before ? 'text-green-600' :
                            h.credit_after < h.credit_before ? 'text-red-500' : 'text-gray-400')}>
                            {Number(h.credit_after).toFixed(1)}
                            {h.credit_after > h.credit_before && ' ↑'}
                            {h.credit_after < h.credit_before && ' ↓'}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ownership panel */}
      {owners.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-bold text-[#262162]">Fantasy Ownership</p>
            <span className="text-xs font-bold text-[#262162] bg-[#eeedf8] px-2.5 py-1 rounded-full">{ownerCount} / {totalTeams ?? '?'} teams · {ownerPct}%</span>
          </div>
          <div className="px-5 pt-3 pb-1">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-[#262162] transition-all" style={{ width: `${Math.min(100, ownerPct)}%` }} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 px-5 py-3">Team</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Owner</th>
                  <th className="text-center text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 py-3">Role</th>
                  <th className="text-right text-[10px] font-bold uppercase tracking-widest text-gray-400 px-5 py-3">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {owners.map((o) => {
                  const ft = o.fantasy_teams; if (!ft) return null
                  const ownerName = (ft.profiles as { display_name: string } | null)?.display_name ?? '—'
                  return (
                    <tr key={o.fantasy_team_id} className="hover:bg-[#eeedf8] transition-colors">
                      <td className="px-5 py-2.5">
                        <Link href={`${base}/teams/${o.fantasy_team_id}`} className="font-semibold text-gray-800 hover:text-[#262162] hover:underline">{ft.team_name}</Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-sm">{ownerName}</td>
                      <td className="px-3 py-2.5 text-center">
                        {o.is_captain ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#fbf927] text-[#262162] text-[10px] font-black">C</span>
                          : o.is_vice_captain ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-[10px] font-black">V</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-2.5 text-right font-bold text-[#262162] tabular-nums">{fmtPts(ft.total_points)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {matches.length === 0 && (
        <div className="rounded-2xl bg-white border border-gray-200 p-16 text-center">
          <div className="text-4xl mb-3">🏏</div>
          <p className="text-gray-500">No match data yet — check back after the first game.</p>
        </div>
      )}
    </div>
  )
}
