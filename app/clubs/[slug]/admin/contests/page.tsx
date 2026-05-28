import { createClient }       from '@/lib/supabase/server'
import { getClubBySlug }     from '@/lib/club'
import { notFound }          from 'next/navigation'
import Link                  from 'next/link'
import { cn }                from '@/lib/utils'
import AdminCreateContest    from '@/components/contests/AdminCreateContest'
import AdminContestActions   from '@/components/admin/AdminContestActions'
import AdminGWDropdown       from '@/components/admin/AdminGWDropdown'
import type { Contest }      from '@/types'

// ── Visual helpers ─────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, string> = {
  public:           'bg-blue-100 text-blue-700',
  private:          'bg-amber-100 text-amber-700',
  head_to_head:     'bg-purple-100 text-purple-700',
  small_league:     'bg-green-100 text-green-700',
  mega:             'bg-[#fef9ee] text-[#C9A84C] border border-[#C9A84C]/30',
  winner_takes_all: 'bg-red-100 text-red-600',
  practice:         'bg-gray-100 text-gray-500',
}

const STATUS_BADGE: Record<string, string> = {
  open:      'bg-green-100 text-green-700',
  locked:    'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-500',
  completed: 'bg-gray-100 text-gray-500',
}

type MatchRow = {
  id: string; match_number: number; opponent: string
  match_date: string; venue: string | null; status: string
}

type ContestRow = Contest & { gameweek_id?: string | null }

// ── Row sub-component (server) ────────────────────────────────────────────────

function ContestTableRow({
  contest,
  entryCount,
  base,
}: {
  contest:    ContestRow
  entryCount: number
  base:       string
}) {
  const raw    = contest as unknown as Record<string, unknown>
  const max    = Number(contest.max_teams ?? raw.max_entries ?? 10)
  const fee    = Number(contest.entry_fee  ?? 0)
  const prize  = Number(contest.prize_pool ?? 0)
  const pct    = max > 0 ? Math.min(100, Math.round((entryCount / max) * 100)) : 0
  const status = (contest.status ?? 'open') as string
  const cType  = (contest.type ?? 'public') as string
  const isGW   = Boolean(contest.gameweek_id)

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-[#fafafa] transition-colors flex-wrap min-h-[56px]">
      {/* Name + badges */}
      <div className="flex-1 min-w-[160px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-semibold text-sm text-gray-800 leading-tight">
            {(contest.name ?? (contest as unknown as Record<string, unknown>).title ?? 'Contest') as string}
          </p>
          <span className={cn(
            'text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full',
            TYPE_BADGE[cType] ?? 'bg-gray-100 text-gray-500',
          )}>
            {cType.replace(/_/g, ' ')}
          </span>
          {isGW && (
            <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#fef9ee] text-[#C9A84C] border border-[#C9A84C]/30">
              GW
            </span>
          )}
        </div>
        {contest.entry_code && (
          <p className="text-[10px] font-mono text-[#C9A84C] tracking-[0.2em] mt-0.5">{contest.entry_code}</p>
        )}
      </div>

      {/* Entry fee */}
      <div className="text-center min-w-[3.5rem]">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 leading-none mb-0.5">Fee</p>
        <p className="text-sm font-black text-gray-700 tabular-nums">
          {fee === 0 ? 'Free' : `£${fee % 1 === 0 ? fee : fee.toFixed(2)}`}
        </p>
      </div>

      {/* Teams / fill bar */}
      <div className="min-w-[5.5rem]">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 leading-none mb-1">Teams</p>
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-black text-gray-700 tabular-nums">{entryCount}/{max}</p>
          <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                pct >= 100 ? 'bg-red-400' : pct >= 80 ? 'bg-orange-400' : 'bg-[#C9A84C]',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Prize pool */}
      <div className="text-center min-w-[4rem]">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 leading-none mb-0.5">Prize</p>
        <p className="text-sm font-black text-[#C9A84C] tabular-nums">
          {prize > 0 ? `£${prize % 1 === 0 ? prize : prize.toFixed(2)}` : '—'}
        </p>
      </div>

      {/* Status badge */}
      <div>
        <span className={cn(
          'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full',
          STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-500',
        )}>
          {status}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <Link
          href={`${base}/contests/${contest.id}`}
          className="px-2 py-1 rounded-lg text-[11px] font-bold border border-gray-200 text-gray-600 hover:border-[#C9A84C]/30 hover:text-[#C9A84C] transition-colors"
        >
          View
        </Link>
        <AdminContestActions
          contestId={contest.id}
          initialStatus={status}
          isGameweek={isGW}
        />
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function ClubAdminContestsPage({
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

  // ── All seasons for this club (not just the active one) ────────────────────
  const { data: allSeasons } = await supabase
    .from('seasons')
    .select('id, name, is_active')
    .eq('club_id', club.id)
    .order('created_at', { ascending: false })

  const season    = (allSeasons ?? []).find(s => s.is_active) ?? null
  const seasonIds = (allSeasons ?? []).map(s => s.id)

  // ── All matches for this club ─────────────────────────────────────────────
  const { data: allMatches } = seasonIds.length > 0
    ? await supabase
        .from('matches')
        .select('id, season_id, match_number, opponent, match_date, venue, status')
        .in('season_id', seasonIds)
        .order('match_date', { ascending: false })
    : { data: [] as MatchRow[] }

  const matchById: Record<string, MatchRow> = {}
  for (const m of allMatches ?? []) matchById[m.id] = m as MatchRow

  // ── Gameweeks for GW generation dropdown (active season) ──────────────────
  const { data: gameweeks } = season
    ? await supabase
        .from('gameweeks')
        .select('id, name, number, match_date')
        .eq('season_id', season.id)
        .order('number')
    : { data: [] as { id: string; name: string; number: number; match_date: string }[] }

  // ── ALL contests for this club — query by season_id IN (all season IDs) ───
  let allContests: ContestRow[] = []
  if (seasonIds.length > 0) {
    const { data } = await supabase
      .from('contests')
      .select('*')
      .in('season_id', seasonIds)
      .order('created_at', { ascending: false })
    allContests = (data ?? []) as ContestRow[]
  }

  // ── Entry counts ──────────────────────────────────────────────────────────
  const contestIds = allContests.map(c => c.id)
  const { data: entries } = contestIds.length > 0
    ? await supabase
        .from('contest_entries')
        .select('contest_id')
        .in('contest_id', contestIds)
    : { data: [] as { contest_id: string }[] }

  const countMap: Record<string, number> = {}
  for (const e of entries ?? []) {
    const ce = e as { contest_id: string }
    countMap[ce.contest_id] = (countMap[ce.contest_id] ?? 0) + 1
  }

  // ── Group contests by match_id, then season-level ─────────────────────────
  const byMatch: Record<string, ContestRow[]> = {}
  const seasonLevel: ContestRow[] = []

  for (const c of allContests) {
    if (c.match_id && matchById[c.match_id]) {
      if (!byMatch[c.match_id]) byMatch[c.match_id] = []
      byMatch[c.match_id].push(c)
    } else {
      seasonLevel.push(c)
    }
  }

  // Matches that actually have contests, ordered by date desc
  const matchesWithContests = (allMatches ?? []).filter(m => byMatch[m.id])

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-[#C9A84C]">Contests</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            {allContests.length.toLocaleString()} total
            {allSeasons && allSeasons.length > 0 && ` across ${allSeasons.length} season${allSeasons.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AdminGWDropdown gameweeks={gameweeks ?? []} />
          <AdminCreateContest seasonId={season?.id ?? ''} userId={user?.id ?? ''} />
        </div>
      </div>

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {allContests.length === 0 ? (
        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-16 text-center">
          <div className="text-4xl mb-3">🏆</div>
          <p className="text-gray-500 font-medium">No contests yet.</p>
          <p className="text-gray-400 text-sm mt-1">Create one above, or use the GW dropdown to generate contests for a gameweek.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── Match-grouped sections ───────────────────────────────────── */}
          {matchesWithContests.map((match) => {
            const m = match as MatchRow
            const contests = byMatch[m.id] ?? []
            return (
              <div key={m.id} className="rounded-2xl border border-gray-200 overflow-hidden">
                {/* Match header */}
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="text-center min-w-[2.5rem] bg-gray-200 text-gray-700 rounded-lg py-1 px-1.5">
                      <p className="text-[9px] font-black uppercase tracking-wide opacity-70">M</p>
                      <p className="font-black text-base leading-none">{m.match_number}</p>
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-800">vs {m.opponent}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(m.match_date).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                        {m.venue ? ` · ${m.venue}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full',
                      m.status === 'completed'
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-[#fef9ee] text-[#C9A84C] border border-[#C9A84C]/30',
                    )}>
                      {m.status}
                    </span>
                    <span className="text-xs text-gray-400 font-semibold">
                      {contests.length} contest{contests.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Contest rows */}
                <div className="divide-y divide-gray-100">
                  {contests.map(contest => (
                    <ContestTableRow
                      key={contest.id}
                      contest={contest}
                      entryCount={countMap[contest.id] ?? 0}
                      base={base}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {/* ── Season-level contests (no match_id) ─────────────────────── */}
          {seasonLevel.length > 0 && (
            <div className="rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <p className="font-bold text-sm text-gray-700">Season-wide Contests</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {seasonLevel.length} contest{seasonLevel.length !== 1 ? 's' : ''} · not tied to a specific match
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {seasonLevel.map(contest => (
                  <ContestTableRow
                    key={contest.id}
                    contest={contest}
                    entryCount={countMap[contest.id] ?? 0}
                    base={base}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
