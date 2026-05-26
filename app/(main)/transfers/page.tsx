import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getMatchDayDeadline } from '@/lib/deadline'
import TransferHub, { type PlayerWithStats } from '@/components/transfers/TransferHub'
import type { Match, TransferLog, PlayerRole } from '@/types'

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function TransfersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── Season ────────────────────────────────────────────────────────────────
  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!season) {
    return (
      <div className="text-center py-24">
        <div className="text-5xl mb-4">🏏</div>
        <h2 className="text-2xl font-bold text-gray-800">No Active Season</h2>
        <p className="text-gray-500 mt-2">An admin needs to activate a season first.</p>
      </div>
    )
  }

  // ── My team ───────────────────────────────────────────────────────────────
  const { data: myTeam } = await supabase
    .from('fantasy_teams')
    .select('*')
    .eq('season_id', season.id)
    .eq('user_id', user!.id)
    .single()

  if (!myTeam) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-[#262162]">Transfers</h1>
        <div className="rounded-2xl bg-white border border-gray-200 p-16 text-center space-y-3">
          <p className="text-gray-500">You don&apos;t have a fantasy team yet.</p>
          <Link
            href="/team"
            className="inline-flex items-center px-5 py-2.5 rounded-xl bg-[#262162] text-white font-semibold text-sm hover:bg-[#1a1748] transition-colors"
          >
            Create Team
          </Link>
        </div>
      </div>
    )
  }

  // ── Matches + transfer logs + players ─────────────────────────────────────
  const [{ data: allMatches }, { data: transferLogs }, { data: rawPlayers }] = await Promise.all([
    supabase.from('matches').select('*').eq('season_id', season.id).order('match_date'),
    supabase
      .from('transfer_logs')
      .select('*')
      .eq('fantasy_team_id', myTeam.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('players')
      .select('id, name, role, price')
      .eq('season_id', season.id)
      .eq('is_active', true)
      .order('price', { ascending: false }),
  ])

  const upcomingMatches  = (allMatches ?? []).filter((m: Match) => m.status === 'upcoming')
  const completedMatches = (allMatches ?? []).filter((m: Match) => m.status === 'completed')
  const nextMatch        = upcomingMatches[0] as Match | undefined
  const lastCompleted    = completedMatches[completedMatches.length - 1] as Match | undefined

  // Match to save transfers against (= next upcoming)
  const saveMatchId = nextMatch?.id ?? null

  // Reference match for displaying current squad (next if selections exist, else last completed)
  const refMatchId = nextMatch?.id ?? lastCompleted?.id ?? null

  // ── Current squad ─────────────────────────────────────────────────────────
  // Try next match first; if empty, fall back to last completed
  let squadSelections: { player_id: string; is_captain: boolean; is_vice_captain: boolean }[] = []
  if (refMatchId) {
    const { data: nextSels } = await supabase
      .from('fantasy_selections')
      .select('player_id, is_captain, is_vice_captain')
      .eq('fantasy_team_id', myTeam.id)
      .eq('match_id', refMatchId)
    squadSelections = nextSels ?? []
  }

  // ── Base squad (for transfer diff) ───────────────────────────────────────
  // The squad locked at the PREVIOUS deadline — use last completed match selections
  let baseSquadIds: string[] = []
  if (lastCompleted) {
    const { data: baseSels } = await supabase
      .from('fantasy_selections')
      .select('player_id')
      .eq('fantasy_team_id', myTeam.id)
      .eq('match_id', lastCompleted.id)
    baseSquadIds = (baseSels ?? []).map((s) => s.player_id)
  }

  // ── Player stats: season total + recent form ──────────────────────────────
  const completedMatchIds = completedMatches.map((m: Match) => m.id)
  const recentMatchIds    = completedMatchIds.slice(-3)          // last ≤3 matches

  // fetch performances only for completed matches
  const { data: perfData } = completedMatchIds.length > 0
    ? await supabase
        .from('match_performances')
        .select('player_id, match_id, base_points')
        .in('match_id', completedMatchIds)
    : { data: [] }

  // season total points per player
  const playerSeasonPts: Record<string, number> = {}
  // per-player per-match base_points (for recent form)
  const playerMatchPts: Record<string, Record<string, number>> = {}

  for (const perf of perfData ?? []) {
    playerSeasonPts[perf.player_id] = (playerSeasonPts[perf.player_id] ?? 0) + perf.base_points
    if (!playerMatchPts[perf.player_id]) playerMatchPts[perf.player_id] = {}
    playerMatchPts[perf.player_id][perf.match_id] = perf.base_points
  }

  // ── Playing XI for next match ─────────────────────────────────────────────
  let playingXI: Set<string> = new Set()
  if (nextMatch) {
    const { data: xiRows } = await supabase
      .from('match_playing_xi')
      .select('player_id')
      .eq('match_id', nextMatch.id)
    playingXI = new Set((xiRows ?? []).map((r: { player_id: string }) => r.player_id))
  }

  // ── Build PlayerWithStats array ───────────────────────────────────────────
  const allPlayers: PlayerWithStats[] = (rawPlayers ?? []).map((p) => ({
    id:        p.id,
    name:      p.name,
    role:      p.role as PlayerRole,
    price:     p.price,
    seasonPts: playerSeasonPts[p.id] ?? 0,
    recentPts: recentMatchIds.map((mid) => playerMatchPts[p.id]?.[mid] ?? null),
    isPlaying: playingXI.has(p.id),
  }))

  const initialSquad = squadSelections.map((s) => ({
    playerId:      s.player_id,
    isCaptain:     s.is_captain,
    isViceCaptain: s.is_vice_captain,
  }))

  // ── Transfer log calculations (same as original) ──────────────────────────
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

  const transferLimit   = myTeam.transfer_limit ?? 300
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

  const nextMatchLabel = nextMatch
    ? `Match ${nextMatch.match_number} vs ${nextMatch.opponent}`
    : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#262162]">Transfers</h1>
          <p className="text-gray-500 mt-0.5">{myTeam.team_name} — {season.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Compact season stats */}
          <div className="hidden sm:flex items-center gap-4 text-center">
            <div>
              <p className={cn('text-xl font-black tabular-nums', confirmedTransfers > 0 ? 'text-[#262162]' : 'text-gray-300')}>
                {confirmedTransfers}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">used</p>
            </div>
            <div className="w-px h-6 bg-gray-200" />
            <div>
              <p className={cn('text-xl font-black tabular-nums', transfersRemaining <= 10 ? 'text-red-600' : 'text-[#262162]')}>
                {transfersRemaining}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">left</p>
            </div>
            <div className="w-px h-6 bg-gray-200" />
            <div>
              <p className="text-xl font-black tabular-nums text-gray-400">{transferLimit}</p>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">limit</p>
            </div>
          </div>
          <Link
            href="/team"
            className="px-4 py-2 rounded-xl border border-[#262162] text-[#262162] text-sm font-semibold hover:bg-[#eeedf8] transition-colors"
          >
            My Team
          </Link>
        </div>
      </div>

      {/* ── Interactive TransferHub ─────────────────────────────────────── */}
      <TransferHub
        myTeamId={myTeam.id}
        teamName={myTeam.team_name}
        nextMatchId={nextMatch?.id ?? null}
        nextMatchLabel={nextMatchLabel}
        saveMatchId={saveMatchId}
        initialSquad={initialSquad}
        allPlayers={allPlayers}
        budget={season.team_budget}
        confirmedTransfers={confirmedTransfers}
        transferLimit={transferLimit}
        baseSquadIds={baseSquadIds}
        megaTransferActive={false}
      />

      {/* ── Transfer History ─────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
        {/* Pending */}
        {pendingLog && (
          <div className="border-b border-[#fbf927]/60 bg-[#fefde8] px-5 py-4">
            <p className="text-sm font-bold text-[#262162] mb-2">⏳ Pending Changes (not yet confirmed)</p>
            <p className="text-xs text-gray-500 mb-3">
              Saved but transfers won&apos;t be deducted until the deadline passes.
            </p>
            <div className="flex gap-6 flex-wrap">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-green-700 mb-1">
                  In ({pendingLog.players_in.length})
                </p>
                {pendingLog.players_in.length === 0
                  ? <p className="text-xs text-gray-400">None</p>
                  : pendingLog.players_in.map((id) => (
                      <p key={id} className="text-xs font-semibold text-green-700">+ {playerMap.get(id) ?? id}</p>
                    ))
                }
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-red-600 mb-1">
                  Out ({pendingLog.players_out.length})
                </p>
                {pendingLog.players_out.length === 0
                  ? <p className="text-xs text-gray-400">None</p>
                  : pendingLog.players_out.map((id) => (
                      <p key={id} className="text-xs font-semibold text-red-600">− {playerMap.get(id) ?? id}</p>
                    ))
                }
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#262162] mb-1">Will Cost</p>
                <p className="text-xl font-black text-[#262162]">{pendingLog.transfers_used}</p>
              </div>
            </div>
          </div>
        )}

        {/* History header */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Confirmed Transfer History</p>
        </div>

        {confirmedLogs.length === 0 && adminLogs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No confirmed transfers yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {confirmedLogs.map((log) => {
              const logMatch = (allMatches ?? []).find((m: Match) => m.id === log.match_id) as Match | undefined
              return (
                <div key={log.id} className="px-5 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {logMatch
                        ? `Match ${logMatch.match_number} — ${logMatch.opponent}`
                        : 'Unknown Match'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(log.created_at).toLocaleDateString('en-AU', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                      {log.is_mega_transfer && (
                        <span className="ml-2 font-semibold text-[#262162]">⚡ Mega</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                      {log.players_in.length > 0 && (
                        <span className="text-xs text-green-700 font-medium">
                          <span className="font-bold">In: </span>
                          {log.players_in.map((id) => playerMap.get(id) ?? id).join(', ')}
                        </span>
                      )}
                      {log.players_out.length > 0 && (
                        <span className="text-xs text-red-600 font-medium">
                          <span className="font-bold">Out: </span>
                          {log.players_out.map((id) => playerMap.get(id) ?? id).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="flex-shrink-0 inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-[#262162] text-white text-xs font-black">
                    −{log.transfers_used}
                  </span>
                </div>
              )
            })}
            {adminLogs.map((log) => (
              <div key={log.id} className="px-5 py-3 flex items-start justify-between gap-4 bg-gray-50">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-700">Admin Adjustment</p>
                  {log.admin_note && <p className="text-xs text-gray-500 mt-0.5">{log.admin_note}</p>}
                  <p className="text-xs text-gray-400">
                    {new Date(log.created_at).toLocaleDateString('en-AU', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                </div>
                <span className={cn(
                  'flex-shrink-0 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-black',
                  log.transfers_used >= 0
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700',
                )}>
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
