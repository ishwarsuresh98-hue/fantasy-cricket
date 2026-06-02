import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import AdminCreateContest from '@/components/contests/AdminCreateContest'
import type { Contest } from '@/types'

export default async function AdminContestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!season) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Create an active season before managing contests.</p>
      </div>
    )
  }

  const { data: contests } = await supabase
    .from('contests')
    .select('*')
    .eq('season_id', season.id)
    .order('created_at', { ascending: false })

  // Entry counts
  const contestIds = (contests ?? []).map((c: Contest) => c.id)
  const { data: entries } = contestIds.length > 0
    ? await supabase
        .from('contest_entries')
        .select('contest_id')
        .in('contest_id', contestIds)
    : { data: [] }

  const countMap: Record<string, number> = {}
  for (const e of entries ?? []) {
    countMap[e.contest_id] = (countMap[e.contest_id] ?? 0) + 1
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#C9A84C]">Contests</h2>
          <p className="text-gray-500 text-sm mt-0.5">{season.name}</p>
        </div>
        <AdminCreateContest seasonId={season.id} userId={user!.id} />
      </div>

      {(!contests || contests.length === 0) ? (
        <div className="rounded-2xl bg-[#f0f0f0] border border-[#d8d8d8] p-16 text-center">
          <div className="text-4xl mb-3">🏆</div>
          <p className="text-gray-500">No contests yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#f0f0f0] border border-[#d8d8d8] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f8f8f8] border-b border-gray-200">
                <th className="text-left text-xs font-bold uppercase tracking-widest text-gray-400 px-5 py-3">Name</th>
                <th className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Type</th>
                <th className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Code</th>
                <th className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Teams</th>
                <th className="text-left text-xs font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Prize</th>
                <th className="text-right text-xs font-bold uppercase tracking-widest text-gray-400 px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(contests ?? []).map((contest: Contest) => {
                const count = countMap[contest.id] ?? 0
                const pct   = Math.round((count / contest.max_teams) * 100)
                return (
                  <tr key={contest.id} className="hover:bg-[#f8f8f8] transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-[#444444]">{contest.name}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full',
                        contest.type === 'private'
                          ? 'bg-[#fef9ee] text-[#C9A84C] border border-[#C9A84C]/40'
                          : 'bg-[#f0f0f0] text-[#C9A84C]',
                      )}>
                        {contest.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {contest.entry_code
                        ? <span className="font-black tracking-[0.2em] text-[#C9A84C] font-mono text-sm">{contest.entry_code}</span>
                        : <span className="text-gray-400 text-xs">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-semibold text-[#aaaaaa] text-sm tabular-nums">
                          {count} / {contest.max_teams}
                        </span>
                        <div className="w-16 h-1.5 bg-[#eeeeee] rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              pct >= 100 ? 'bg-red-400' : pct >= 80 ? 'bg-orange-400' : 'bg-[#f0f0f0]',
                            )}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {contest.prize_description
                        ? <p className="text-xs text-gray-500 truncate">{contest.prize_description}</p>
                        : <span className="text-gray-400 text-xs">—</span>
                      }
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/contests/${contest.id}`}
                        className="text-xs font-semibold text-[#C9A84C] hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
