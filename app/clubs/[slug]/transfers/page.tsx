import { createClient } from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getMatchDayDeadline } from '@/lib/deadline'
import TransferHub, { type PlayerWithStats } from '@/components/transfers/TransferHub'
import type { Match, TransferLog, PlayerRole } from '@/types'

export default async function ClubTransfersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const base = `/clubs/${slug}`

  const { data: season } = await supabase
    .from('seasons').select('*').eq('is_active', true).eq('club_id', club.id).single()

  if (!season) {
    return (
      <div className="text-center py-24">
        <div className="text-5xl mb-4">🏏</div>
        <h2 className="text-2xl font-bold text-[#111111]">No Active Season</h2>
        <p className="text-[#111111]/40 mt-2">An admin needs to activate a season first.</p>
      </div>
    )
  }

  const { data: myTeam } = await supabase
    .from('fantasy_teams').select('*').eq('season_id', season.id).eq('user_id', user!.id).single()

  if (!myTeam) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-[#C9A84C]">Transfers</h1>
        <div className="rounded-2xl bg-[#f4f4f4] border border-[#C9A84C]/20 p-16 text-center space-y-3">
          <p className="text-[#111111]/40">You don&apos;t have a fantasy team yet.</p>
          <Link href={`${base}/team`} className="inline-flex items-center px-5 py-2.5 rounded-xl bg-[#C9A84C] text-[#0b0b0b] font-black text-sm hover:bg-[#a8892e] transition-colors">
            Create Team
          </Link>
        </div>
      </div>
    )
  }

  const [{ data: allMatches }, { data: transferLogs }, { data: rawPlayers }] = await Promise.all([
    supabase.from('matches').select('*').eq('season_id', season.id).order('match_date'),
    supabase.from('transfer_logs').select('*').eq('fantasy_team_id', myTeam.id).order('created_at', { ascending: false }),
    supabase.from('players').select('id, name, role, price').eq('season_id', season.id).eq('is_active', true).order('price', { ascending: false }),
  ])

  const upcomingMatches  = (allMatches ?? []).filter((m: Match) => m.status === 'upcoming')
  const completedMatches = (allMatches ?? []).filter((m: Match) => m.status === 'completed')
  const nextMatch        = upcomingMatches[0] as Match | undefined
  const lastCompleted    = completedMatches[completedMatches.length - 1] as Match | undefined

  const saveMatchId = nextMatch?.id ?? null
  const refMatchId  = nextMatch?.id ?? lastCompleted?.id ?? null

  let squadSelections: { player_id: string; is_captain: boolean; is_vice_captain: boolean }[] = []
  if (refMatchId) {
    const { data: nextSels } = await supabase
      .from('fantasy_selections').select('player_id, is_captain, is_vice_captain')
      .eq('fantasy_team_id', myTeam.id).eq('match_id', refMatchId)
    squadSelections = nextSels ?? []
  }

  let baseSquadIds: string[] = []
  if (lastCompleted) {
    const { data: baseSels } = await supabase
      .from('fantasy_selections').select('player_id')
      .eq('fantasy_team_id', myTeam.id).eq('match_id', lastCompleted.id)
    baseSquadIds = (baseSels ?? []).map((s) => s.player_id)
  }

  const completedMatchIds = completedMatches.map((m: Match) => m.id)
  const recentMatchIds    = completedMatchIds.slice(-3)

  const { data: perfData } = completedMatchIds.length > 0
    ? await supabase.from('match_performances').select('player_id, match_id, base_points').in('match_id', completedMatchIds)
    : { data: [] }

  const playerSeasonPts: Record<string, number> = {}
  const playerMatchPts: Record<string, Record<string, number>> = {}
  for (const perf of perfData ?? []) {
    playerSeasonPts[perf.player_id] = (playerSeasonPts[perf.player_id] ?? 0) + perf.base_points
    if (!playerMatchPts[perf.player_id]) playerMatchPts[perf.player_id] = {}
    playerMatchPts[perf.player_id][perf.match_id] = perf.base_points
  }

  let playingXI: Set<string> = new Set()
  if (nextMatch) {
    const { data: xiRows } = await supabase
      .from('match_playing_xi').select('player_id').eq('match_id', nextMatch.id)
    playingXI = new Set((xiRows ?? []).map((r: { player_id: string }) => r.player_id))
  }

  const allPlayers: PlayerWithStats[] = (rawPlayers ?? []).map((p) => ({
    id: p.id, name: p.name, role: p.role as PlayerRole, price: p.price,
    seasonPts: playerSeasonPts[p.id] ?? 0,
    recentPts: recentMatchIds.map((mid) => playerMatchPts[p.id]?.[mid] ?? null),
    isPlaying: playingXI.has(p.id),
  }))

  const initialSquad = squadSelections.map((s) => ({
    playerId: s.player_id, isCaptain: s.is_captain, isViceCaptain: s.is_vice_captain,
  }))

  const playerMap = new Map((rawPlayers ?? []).map((p) => [p.id, p.name]))

  let confirmedTransfers = 0
  const now = Date.now()
  for (const log of (transferLogs ?? []) as TransferLog[]) {
    if (log.admin_adjustment) { confirmedTransfers += log.transfers_used; continue }
    if (!log.match_id) continue
    const logMatch = (allMatches ?? []).find((m: Match) => m.id === log.match_id)
    if (!logMatch) continue
    const deadline = getMatchDayDeadline(logMatch, allMatches ?? [])
    if (deadline && now > deadline.getTime()) confirmedTransfers += log.transfers_used
  }

  const transferLimit      = myTeam.transfer_limit ?? 300
  const transfersRemaining = transferLimit - confirmedTransfers

  const pendingLog = (transferLogs ?? []).find((log: TransferLog) => {
    if (log.admin_adjustment || !log.match_id) return false
    const logMatch = (allMatches ?? []).find((m: Match) => m.id === log.match_id)
    if (!logMatch) return false
    const deadline = getMatchDayDeadline(logMatch, allMatches ?? [])
    return !deadline || now <= deadline.getTime()
  }) as TransferLog | undefined

  const confirmedLogs = (transferLogs ?? []).filter((log: TransferLog) => {
    if (log.admin_adjustment || !log.match_id) return false
    const logMatch = (allMatches ?? []).find((m: Match) => m.id === log.match_id)
    if (!logMatch) return false
    const deadline = getMatchDayDeadline(logMatch, allMatches ?? [])
    return deadline && now > deadline.getTime()
  }) as TransferLog[]

  const adminLogs = (transferLogs ?? []).filter((log: TransferLog) => log.admin_adjustment) as TransferLog[]
  const nextMatchLabel = nextMatch ? `Match ${nextMatch.match_number} vs ${nextMatch.opponent}` : null

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl bg-[#f4f4f4] border border-[#C9A84C]/20 px-5 py-5 overflow-hidden">
        {/* top shimmer */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C9A84C]/50 to-transparent" />
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-[#C9A84C] tracking-tight">Transfers</h1>
            <p className="text-[#111111]/40 text-sm mt-0.5">{myTeam.team_name} · {season.name}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Transfer counters */}
            <div className="hidden sm:flex items-center gap-4 text-center bg-gray-50 border border-gray-200 rounded-xl px-4 py-2">
              <div>
                <p className={cn('text-lg font-black tabular-nums leading-none', confirmedTransfers > 0 ? 'text-[#C9A84C]' : 'text-[#111111]/30')}>{confirmedTransfers}</p>
                <p className="text-[9px] uppercase tracking-widest text-[#111111]/30 mt-0.5">used</p>
              </div>
              <div className="w-px h-5 bg-gray-100" />
              <div>
                <p className={cn('text-lg font-black tabular-nums leading-none', transfersRemaining <= 10 ? 'text-red-400' : 'text-[#C9A84C]')}>{transfersRemaining}</p>
                <p className="text-[9px] uppercase tracking-widest text-[#111111]/30 mt-0.5">left</p>
              </div>
              <div className="w-px h-5 bg-gray-100" />
              <div>
                <p className="text-lg font-black tabular-nums leading-none text-[#111111]/30">{transferLimit}</p>
                <p className="text-[9px] uppercase tracking-widest text-[#111111]/30 mt-0.5">limit</p>
              </div>
            </div>
            <Link href={`${base}/team`} className="px-4 py-2 rounded-xl border border-[#C9A84C]/40 text-[#C9A84C] text-sm font-semibold hover:bg-[#C9A84C]/10 transition-colors">
              My Team
            </Link>
          </div>
        </div>
      </div>

      <TransferHub
        myTeamId={myTeam.id} teamName={myTeam.team_name}
        nextMatchId={nextMatch?.id ?? null} nextMatchLabel={nextMatchLabel}
        saveMatchId={saveMatchId} initialSquad={initialSquad} allPlayers={allPlayers}
        budget={season.team_budget} confirmedTransfers={confirmedTransfers}
        transferLimit={transferLimit} baseSquadIds={baseSquadIds} megaTransferActive={false}
      />

      {/* ── Transfer history ────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-[#f4f4f4] border border-[#C9A84C]/20 overflow-hidden">
        {/* top shimmer */}
        <div className="h-px bg-gradient-to-r from-transparent via-[#C9A84C]/40 to-transparent" />

        {pendingLog && (
          <div className="border-b border-[#C9A84C]/20 bg-[#C9A84C]/5 px-5 py-4">
            <p className="text-sm font-bold text-[#C9A84C] mb-1">⏳ Pending Changes</p>
            <p className="text-xs text-[#111111]/30 mb-3">Saved but transfers won&apos;t be deducted until the deadline passes.</p>
            <div className="flex gap-6 flex-wrap">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70 mb-1">In ({pendingLog.players_in.length})</p>
                {pendingLog.players_in.length === 0
                  ? <p className="text-xs text-[#111111]/30">None</p>
                  : pendingLog.players_in.map((id) => <p key={id} className="text-xs font-semibold text-emerald-400">+ {playerMap.get(id) ?? id}</p>)}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-400/70 mb-1">Out ({pendingLog.players_out.length})</p>
                {pendingLog.players_out.length === 0
                  ? <p className="text-xs text-[#111111]/30">None</p>
                  : pendingLog.players_out.map((id) => <p key={id} className="text-xs font-semibold text-red-400">− {playerMap.get(id) ?? id}</p>)}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#C9A84C]/60 mb-1">Will Cost</p>
                <p className="text-xl font-black text-[#C9A84C]">{pendingLog.transfers_used}</p>
              </div>
            </div>
          </div>
        )}

        <div className="px-5 py-3 border-b border-gray-200">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#111111]/30">Confirmed Transfer History</p>
        </div>

        {confirmedLogs.length === 0 && adminLogs.length === 0 ? (
          <p className="text-sm text-[#111111]/30 text-center py-10">No confirmed transfers yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {confirmedLogs.map((log) => {
              const logMatch = (allMatches ?? []).find((m: Match) => m.id === log.match_id) as Match | undefined
              return (
                <div key={log.id} className="px-5 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#111111]/80">
                      {logMatch ? `Match ${logMatch.match_number} — ${logMatch.opponent}` : 'Unknown Match'}
                    </p>
                    <p className="text-xs text-[#111111]/30 mt-0.5">
                      {new Date(log.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {log.is_mega_transfer && <span className="ml-2 font-semibold text-[#C9A84C]">⚡ Mega</span>}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                      {log.players_in.length > 0 && (
                        <span className="text-xs text-emerald-400 font-medium"><span className="font-bold">In: </span>{log.players_in.map((id) => playerMap.get(id) ?? id).join(', ')}</span>
                      )}
                      {log.players_out.length > 0 && (
                        <span className="text-xs text-red-400 font-medium"><span className="font-bold">Out: </span>{log.players_out.map((id) => playerMap.get(id) ?? id).join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <span className="flex-shrink-0 inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-black">−{log.transfers_used}</span>
                </div>
              )
            })}
            {adminLogs.map((log) => (
              <div key={log.id} className="px-5 py-3 flex items-start justify-between gap-4 bg-gray-50">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#C9A84C]/70">Admin Adjustment</p>
                  {log.admin_note && <p className="text-xs text-[#111111]/30 mt-0.5">{log.admin_note}</p>}
                  <p className="text-xs text-[#111111]/20">{new Date(log.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <span className={cn('flex-shrink-0 inline-flex items-center justify-center px-2 py-0.5 rounded-full border text-xs font-black',
                  log.transfers_used >= 0
                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20')}>
                  {log.transfers_used >= 0 ? `−${log.transfers_used}` : `+${Math.abs(log.transfers_used)}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
