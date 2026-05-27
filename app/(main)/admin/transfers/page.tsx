import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getMatchDayDeadline } from '@/lib/deadline'
import AdminTransferAdjust from '@/components/admin/AdminTransferAdjust'
import type { Match, TransferLog, FantasyTeam, Profile } from '@/types'

export default async function AdminTransfersPage() {
  const supabase = await createClient()

  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!season) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No active season.</p>
      </div>
    )
  }

  const [{ data: allMatches }, { data: allTeams }, { data: allLogs }] = await Promise.all([
    supabase.from('matches').select('*').eq('season_id', season.id).order('match_date'),
    supabase.from('fantasy_teams').select('*, profiles(display_name)').eq('season_id', season.id).order('total_points', { ascending: false }),
    supabase.from('transfer_logs').select('*').order('created_at'),
  ])

  const now = Date.now()

  // Compute confirmed transfers per team
  const teamTransferMap = new Map<string, number>()

  for (const log of (allLogs ?? []) as TransferLog[]) {
    const prev = teamTransferMap.get(log.fantasy_team_id) ?? 0
    if (log.admin_adjustment) {
      teamTransferMap.set(log.fantasy_team_id, prev + log.transfers_used)
      continue
    }
    if (!log.match_id) continue
    const logMatch = (allMatches ?? []).find((m: Match) => m.id === log.match_id)
    if (!logMatch) continue
    const deadline = getMatchDayDeadline(logMatch, allMatches ?? [])
    if (deadline && now > deadline.getTime()) {
      teamTransferMap.set(log.fantasy_team_id, prev + log.transfers_used)
    }
  }

  // Pending (not-yet-confirmed) per team
  const pendingMap = new Map<string, number>()
  for (const log of (allLogs ?? []) as TransferLog[]) {
    if (log.admin_adjustment || !log.match_id) continue
    const logMatch = (allMatches ?? []).find((m: Match) => m.id === log.match_id)
    if (!logMatch) return
    const deadline = getMatchDayDeadline(logMatch, allMatches ?? [])
    if (!deadline || now <= deadline.getTime()) {
      const prev = pendingMap.get(log.fantasy_team_id) ?? 0
      pendingMap.set(log.fantasy_team_id, prev + log.transfers_used)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#ebebeb]">Transfer Management</h2>
        <p className="text-muted-foreground">View and adjust transfer balances for all teams.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Teams — Transfer Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0f0f0f] border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide">Team</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide">Manager</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide">Confirmed Used</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide">Pending</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide">Limit</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide">Remaining</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide">Adjust</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(allTeams ?? []).map((team: FantasyTeam & { profiles?: Profile }) => {
                  const confirmed = teamTransferMap.get(team.id) ?? 0
                  const pending = pendingMap.get(team.id) ?? 0
                  const limit = team.transfer_limit ?? 300
                  const remaining = limit - confirmed
                  return (
                    <tr key={team.id} className="hover:bg-[#0f0f0f]">
                      <td className="px-4 py-3 font-medium">{team.team_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{team.profiles?.display_name ?? '—'}</td>
                      <td className="px-4 py-3 text-center font-semibold text-[#C9A84C]">{confirmed}</td>
                      <td className="px-4 py-3 text-center text-yellow-700">{pending > 0 ? `+${pending}` : '—'}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{limit}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${remaining <= 10 ? 'text-[#b5211e]' : remaining <= 50 ? 'text-orange-600' : 'text-green-700'}`}>
                          {remaining}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AdminTransferAdjust fantasyTeamId={team.id} teamName={team.team_name} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
