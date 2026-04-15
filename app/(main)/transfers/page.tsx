import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getMatchDayDeadline } from '@/lib/deadline'
import type { Match, TransferLog } from '@/types'

export default async function TransfersPage() {
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
        <div className="text-5xl mb-4">🏏</div>
        <h2 className="text-2xl font-bold text-gray-800">No Active Season</h2>
        <p className="text-muted-foreground mt-2">An admin needs to activate a season first.</p>
      </div>
    )
  }

  const { data: myTeam } = await supabase
    .from('fantasy_teams')
    .select('*')
    .eq('season_id', season.id)
    .eq('user_id', user!.id)
    .single()

  if (!myTeam) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-[#262162]">Transfer History</h1>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">You don&apos;t have a fantasy team yet.</p>
            <Link href="/team" className={cn(buttonVariants(), 'mt-4 inline-flex bg-[#262162] hover:bg-[#1a1748]')}>
              Create Team
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const [{ data: allMatches }, { data: transferLogs }, { data: players }] = await Promise.all([
    supabase.from('matches').select('*').eq('season_id', season.id).order('match_date'),
    supabase.from('transfer_logs').select('*').eq('fantasy_team_id', myTeam.id).order('created_at', { ascending: false }),
    supabase.from('players').select('id, name').eq('season_id', season.id),
  ])

  const playerMap = new Map((players ?? []).map((p) => [p.id, p.name]))

  // Compute confirmed transfers
  let confirmedTransfers = 0
  const now = Date.now()
  for (const log of (transferLogs ?? []) as TransferLog[]) {
    if (log.admin_adjustment) {
      confirmedTransfers += log.transfers_used
      continue
    }
    if (!log.match_id) continue
    const logMatch = (allMatches ?? []).find((m: Match) => m.id === log.match_id)
    if (!logMatch) continue
    const deadline = getMatchDayDeadline(logMatch, allMatches ?? [])
    if (deadline && now > deadline.getTime()) {
      confirmedTransfers += log.transfers_used
    }
  }

  const transferLimit = myTeam.transfer_limit ?? 300
  const transfersRemaining = transferLimit - confirmedTransfers

  // Find pending log (latest non-admin, non-confirmed log)
  const pendingLog = (transferLogs ?? []).find((log: TransferLog) => {
    if (log.admin_adjustment || !log.match_id) return false
    const logMatch = (allMatches ?? []).find((m: Match) => m.id === log.match_id)
    if (!logMatch) return false
    const deadline = getMatchDayDeadline(logMatch, allMatches ?? [])
    return !deadline || now <= deadline.getTime()
  }) as TransferLog | undefined

  // Group confirmed logs by match
  const confirmedLogs = (transferLogs ?? []).filter((log: TransferLog) => {
    if (log.admin_adjustment) return false
    if (!log.match_id) return false
    const logMatch = (allMatches ?? []).find((m: Match) => m.id === log.match_id)
    if (!logMatch) return false
    const deadline = getMatchDayDeadline(logMatch, allMatches ?? [])
    return deadline && now > deadline.getTime()
  }) as TransferLog[]

  const adminLogs = (transferLogs ?? []).filter((log: TransferLog) => log.admin_adjustment) as TransferLog[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#262162]">Transfer History</h1>
          <p className="text-muted-foreground mt-0.5">{myTeam.team_name} — {season.name}</p>
        </div>
        <Link href="/team" className={cn(buttonVariants({ variant: 'outline' }), 'border-[#262162] text-[#262162] hover:bg-[#eeedf8]')}>
          Manage Team
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-[#262162]">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Confirmed Used</p>
            <p className="text-3xl font-bold text-[#262162] mt-1">{confirmedTransfers}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#fbf927]">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Remaining</p>
            <p className={`text-3xl font-bold mt-1 ${transfersRemaining <= 10 ? 'text-[#b5211e]' : 'text-[#262162]'}`}>
              {transfersRemaining}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-gray-300">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Season Limit</p>
            <p className="text-3xl font-bold text-gray-800 mt-1">{transferLimit}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending changes */}
      {pendingLog && (
        <Card className="border border-[#fbf927] bg-[#fefde8]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-[#262162]">⏳ Pending Changes (not yet confirmed)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              These changes are saved but transfers won&apos;t be deducted until the deadline passes.
            </p>
            <div className="flex gap-8">
              <div>
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Players In ({pendingLog.players_in.length})</p>
                {pendingLog.players_in.length === 0
                  ? <p className="text-sm text-muted-foreground">None</p>
                  : pendingLog.players_in.map((id) => (
                    <p key={id} className="text-sm font-medium text-green-700">+ {playerMap.get(id) ?? id}</p>
                  ))
                }
              </div>
              <div>
                <p className="text-xs font-semibold text-[#b5211e] uppercase tracking-wide mb-1">Players Out ({pendingLog.players_out.length})</p>
                {pendingLog.players_out.length === 0
                  ? <p className="text-sm text-muted-foreground">None</p>
                  : pendingLog.players_out.map((id) => (
                    <p key={id} className="text-sm font-medium text-[#b5211e]">- {playerMap.get(id) ?? id}</p>
                  ))
                }
              </div>
              <div>
                <p className="text-xs font-semibold text-[#262162] uppercase tracking-wide mb-1">Will Cost</p>
                <p className="text-2xl font-bold text-[#262162]">{pendingLog.transfers_used}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmed transfer history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#262162]">Confirmed Transfer History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {confirmedLogs.length === 0 && adminLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No confirmed transfers yet.</p>
          ) : (
            <div className="divide-y">
              {confirmedLogs.map((log) => {
                const logMatch = (allMatches ?? []).find((m: Match) => m.id === log.match_id)
                return (
                  <div key={log.id} className="px-4 py-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          {logMatch
                            ? `Match ${(logMatch as Match).match_number} — ${(logMatch as Match).opponent}`
                            : 'Unknown Match'
                          }
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {log.is_mega_transfer && <span className="ml-2 text-[#262162] font-semibold">⚡ Mega Transfer</span>}
                        </p>
                        <div className="flex gap-4 mt-2">
                          {log.players_in.length > 0 && (
                            <div>
                              <span className="text-xs font-semibold text-green-700 uppercase">In: </span>
                              <span className="text-xs text-green-700">{log.players_in.map((id) => playerMap.get(id) ?? id).join(', ')}</span>
                            </div>
                          )}
                          {log.players_out.length > 0 && (
                            <div>
                              <span className="text-xs font-semibold text-[#b5211e] uppercase">Out: </span>
                              <span className="text-xs text-[#b5211e]">{log.players_out.map((id) => playerMap.get(id) ?? id).join(', ')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Badge className="bg-[#262162] text-white hover:bg-[#262162]">
                        -{log.transfers_used}
                      </Badge>
                    </div>
                  </div>
                )
              })}
              {adminLogs.map((log) => (
                <div key={log.id} className="px-4 py-3 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Admin Adjustment</p>
                      {log.admin_note && <p className="text-xs text-muted-foreground mt-0.5">{log.admin_note}</p>}
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <Badge variant={log.transfers_used >= 0 ? 'destructive' : 'secondary'}>
                      {log.transfers_used >= 0 ? `-${log.transfers_used}` : `+${Math.abs(log.transfers_used)}`}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
