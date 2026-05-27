import { createClient } from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import ContestCreateModal from '@/components/contests/ContestCreateModal'
import JoinWithCode from '@/components/contests/JoinWithCode'
import JoinContestButton from '@/components/contests/JoinContestButton'
import type { Contest, ContestEntry } from '@/types'

export default async function ClubContestsPage({
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
        <div className="text-5xl mb-4">🏆</div>
        <h2 className="text-2xl font-bold text-gray-800">No Active Season</h2>
        <p className="text-gray-500 mt-2">Contests will appear once a season is active.</p>
      </div>
    )
  }

  const { data: myTeam } = await supabase
    .from('fantasy_teams').select('id').eq('season_id', season.id).eq('user_id', user!.id).maybeSingle()
  const myTeamId = myTeam?.id ?? null

  const { data: contests } = await supabase
    .from('contests').select('*').eq('season_id', season.id).order('created_at', { ascending: false })

  const contestIds = (contests ?? []).map((c: Contest) => c.id)
  const { data: allEntries } = contestIds.length > 0
    ? await supabase.from('contest_entries').select('contest_id, fantasy_team_id').in('contest_id', contestIds)
    : { data: [] }

  const entryCountMap: Record<string, number> = {}
  const myEnteredIds = new Set<string>()
  for (const entry of (allEntries ?? []) as ContestEntry[]) {
    entryCountMap[entry.contest_id] = (entryCountMap[entry.contest_id] ?? 0) + 1
    if (myTeamId && entry.fantasy_team_id === myTeamId) myEnteredIds.add(entry.contest_id)
  }

  const publicContests  = (contests ?? []).filter((c: Contest) => c.type === 'public')
  const privateContests = (contests ?? []).filter((c: Contest) => c.type === 'private')
  const myContests      = (contests ?? []).filter((c: Contest) => myEnteredIds.has(c.id))

  function ContestCard({
    contest, entryCount, alreadyJoined, myTeamId: tId, showCode = false,
  }: { contest: Contest; entryCount: number; alreadyJoined: boolean; myTeamId: string | null; showCode?: boolean }) {
    const isFull   = entryCount >= contest.max_teams
    const fillPct  = Math.min(100, (entryCount / contest.max_teams) * 100)
    const isPrivate = contest.type === 'private'

    return (
      <div className={cn('flex flex-col rounded-2xl border-2 bg-white overflow-hidden transition-shadow hover:shadow-md',
        alreadyJoined ? 'border-[#262162]' : 'border-gray-200')}>
        <div className="bg-[#262162] px-4 py-3 flex items-start justify-between gap-2">
          <div className="min-w-0"><p className="text-white font-bold text-sm truncate">{contest.name}</p></div>
          <span className={cn('flex-shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full',
            isPrivate ? 'bg-[#fbf927] text-[#262162]' : 'bg-white/20 text-white')}>
            {isPrivate ? '🔒 Private' : '🌐 Public'}
          </span>
        </div>
        <div className="p-4 flex flex-col gap-3 flex-1">
          {contest.prize_description && (
            <div className="bg-[#fefde8] border border-[#fbf927]/40 rounded-xl px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#262162]/60 mb-0.5">🏆 Prize</p>
              <p className="text-xs text-gray-700 leading-snug">{contest.prize_description}</p>
            </div>
          )}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-semibold text-gray-500">
              <span>{entryCount} team{entryCount !== 1 ? 's' : ''} entered</span>
              <span className={isFull ? 'text-red-500' : 'text-gray-400'}>{isFull ? 'FULL' : `${contest.max_teams - entryCount} spots left`}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', isFull ? 'bg-red-400' : fillPct > 80 ? 'bg-orange-400' : 'bg-[#262162]')} style={{ width: `${fillPct}%` }} />
            </div>
          </div>
          {showCode && isPrivate && contest.entry_code && (
            <div className="flex items-center gap-2 bg-[#eeedf8] rounded-xl px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#262162]/60">Code</span>
              <span className="font-black tracking-[0.2em] text-[#262162] font-mono text-sm">{contest.entry_code}</span>
            </div>
          )}
          <div className="flex items-center gap-2 mt-auto pt-1">
            {!isPrivate && (
              <JoinContestButton contestId={contest.id} fantasyTeamId={tId} alreadyJoined={alreadyJoined} isFull={isFull} />
            )}
            <Link
              href={`${base}/contests/${contest.id}`}
              className={cn('flex-1 text-center py-1.5 rounded-lg text-xs font-bold border transition-colors',
                alreadyJoined ? 'border-[#262162] text-[#262162] hover:bg-[#eeedf8]' : 'border-gray-200 text-gray-500 hover:border-gray-400')}
            >
              View Leaderboard →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#262162]">Contests</h1>
          <p className="text-gray-500 mt-0.5">{season.name}</p>
        </div>
        <div className="flex gap-2">
          <ContestCreateModal seasonId={season.id} myFantasyTeamId={myTeamId} userId={user!.id} />
        </div>
      </div>

      <JoinWithCode myFantasyTeamId={myTeamId} />

      {/* Public */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">Public Contests</h2>
          <div className="h-px flex-1 bg-gray-200" />
        </div>
        {publicContests.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-12 text-center"><div className="text-3xl mb-2">📭</div><p className="text-gray-500 text-sm">No public contests yet.</p></div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {publicContests.map((contest: Contest) => (
              <ContestCard key={contest.id} contest={contest} entryCount={entryCountMap[contest.id] ?? 0} alreadyJoined={myEnteredIds.has(contest.id)} myTeamId={myTeamId} />
            ))}
          </div>
        )}
      </section>

      {/* My leagues */}
      {myContests.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">My Leagues</h2>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myContests.map((contest: Contest) => (
              <ContestCard key={contest.id} contest={contest} entryCount={entryCountMap[contest.id] ?? 0} alreadyJoined myTeamId={myTeamId} showCode />
            ))}
          </div>
        </section>
      )}

      {/* Private invite-only */}
      {privateContests.filter((c: Contest) => !myEnteredIds.has(c.id)).length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">Private Leagues (invite only)</h2>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {privateContests.filter((c: Contest) => !myEnteredIds.has(c.id)).map((contest: Contest) => (
              <ContestCard key={contest.id} contest={contest} entryCount={entryCountMap[contest.id] ?? 0} alreadyJoined={false} myTeamId={myTeamId} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
