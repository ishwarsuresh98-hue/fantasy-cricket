import { createClient }    from '@/lib/supabase/server'
import { getClubBySlug }  from '@/lib/club'
import { notFound }       from 'next/navigation'
import Link               from 'next/link'
import { cn }             from '@/lib/utils'
import { netPrizePool, type PrizeSlot } from '@/lib/prizes'
import type { ContestCategory, LobbyContest, MatchGroup } from '@/types'
import ContestPageClient         from '@/components/contests/ContestPageClient'

// Map DB contest type → ContestCategory
const TYPE_TO_CATEGORY: Record<string, ContestCategory> = {
  head_to_head:     'h2h',
  small_league:     'small_league',
  mega:             'mega',
  winner_takes_all: 'jackpot',
  practice:         'practice',
  open_league:      'open_league',
  public:           'small_league',
  private:          'small_league',
}

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
  const userId = user?.id ?? ''
  const base = `/clubs/${slug}`

  // ── Active season ──────────────────────────────────────────────────────────
  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .eq('club_id', club.id)
    .single()

  if (!season) {
    return (
      <div className="text-center py-24">
        <div className="text-5xl mb-4">🏆</div>
        <h2 className="text-2xl font-bold text-gray-700">No Active Season</h2>
        <p className="text-gray-500 mt-2">Contests will appear once a season is active.</p>
      </div>
    )
  }

  // ── User team & wallet ─────────────────────────────────────────────────────
  const [{ data: myTeam }, { data: wallet }] = await Promise.all([
    userId ? supabase.from('fantasy_teams').select('id').eq('season_id', season.id).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
    userId ? supabase.from('wallets').select('balance').eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const myTeamId      = myTeam?.id ?? null
  const walletBalance = Number(wallet?.balance ?? 0)

  // ── Active gameweek + its contests ────────────────────────────────────────
  // DB columns: gameweek_number, start_date, end_date (not number/match_id/match_date)
  const { data: activeGw } = await supabase
    .from('gameweeks')
    .select('id, gameweek_number, name, start_date, end_date, deadline')
    .eq('season_id', season.id)
    .eq('is_active', true)
    .maybeSingle()

  let gwContests: Record<string, unknown>[] = []
  let myGwContestTeamIds = new Set<string>()
  let gwPlayerCount = 0
  let gwMatches: { id: string; our_team: string; opponent_team: string; venue: string | null; match_date: string }[] = []

  if (activeGw) {
    const gw = activeGw as unknown as {
      id: string; gameweek_number: number; name: string
      start_date: string; end_date: string; deadline: string
    }

    const [{ data: gwRows }, { data: matchRows }] = await Promise.all([
      supabase
        .from('contests')
        .select('*')
        .eq('gameweek_id', gw.id)
        .or('status.eq.open,status.is.null')
        .order('entry_fee', { ascending: true }),
      // Fetch all matches that fall within the gameweek window
      supabase
        .from('matches')
        .select('id, our_team, opponent_team, venue, match_date')
        .eq('season_id', season.id)
        .gte('match_date', gw.start_date)
        .lte('match_date', gw.end_date)
        .order('match_date', { ascending: true }),
    ])

    gwContests = (gwRows ?? []) as Record<string, unknown>[]
    gwMatches  = (matchRows ?? []) as typeof gwMatches

    // Count players with confirmed XI across all GW matches
    if (gwMatches.length > 0) {
      const matchIds = gwMatches.map((m) => m.id)
      const { count: xiCount } = await supabase
        .from('match_playing_xi')
        .select('player_id', { count: 'exact', head: true })
        .in('match_id', matchIds)
      gwPlayerCount = xiCount ?? 0
    }

    // Which GW contests does the user already have a contest_team for?
    if (userId && gwContests.length > 0) {
      const gwContestIds = gwContests.map((c) => c.id as string)
      const { data: myTeams } = await supabase
        .from('contest_teams')
        .select('contest_id')
        .eq('user_id', userId)
        .in('contest_id', gwContestIds)
      myGwContestTeamIds = new Set((myTeams ?? []).map((t: { contest_id: string }) => t.contest_id))
    }
  }

  // ── All upcoming matches ───────────────────────────────────────────────────
  const { data: upcomingMatches } = await supabase
    .from('matches')
    .select('id, match_number, opponent_team, match_date, venue, status')
    .eq('season_id', season.id)
    .eq('status', 'upcoming')
    .order('match_date', { ascending: true })
    .limit(10)

  const matchList = upcomingMatches ?? []

  // ── Open contests for ALL upcoming matches ─────────────────────────────────
  const upcomingIds = matchList.map((m) => m.id)
  let allMatchContests: Record<string, unknown>[] = []
  if (upcomingIds.length > 0) {
    const { data } = await supabase
      .from('contests')
      .select('*')
      .in('match_id', upcomingIds)
      .or('status.eq.open,status.is.null')
      .order('entry_fee', { ascending: true })
    allMatchContests = (data ?? []) as Record<string, unknown>[]
  }

  // ── Season-level contests (no match_id) ────────────────────────────────────
  const { data: seasonContests } = await supabase
    .from('contests')
    .select('*')
    .eq('season_id', season.id)
    .is('match_id', null)
    .or('status.eq.open,status.is.null')
    .order('created_at', { ascending: false })
  const seasonContestList = (seasonContests ?? []) as Record<string, unknown>[]

  const allContests = [...allMatchContests, ...seasonContestList]
  const contestIds  = allContests.map((c) => c.id as string)

  // ── Entry counts + my entries ──────────────────────────────────────────────
  const { data: allEntries } = contestIds.length > 0
    ? await supabase.from('contest_entries').select('contest_id, fantasy_team_id').in('contest_id', contestIds)
    : { data: [] }

  const entryCountMap: Record<string, number> = {}
  const myEnteredIds  = new Set<string>()
  for (const entry of allEntries ?? []) {
    const e = entry as { contest_id: string; fantasy_team_id: string }
    entryCountMap[e.contest_id] = (entryCountMap[e.contest_id] ?? 0) + 1
    if (myTeamId && e.fantasy_team_id === myTeamId) myEnteredIds.add(e.contest_id)
  }

  // ── Map raw DB row → LobbyContest ──────────────────────────────────────────
  function toLobbyCcontest(c: Record<string, unknown>): LobbyContest {
    const id         = c.id as string
    const cType      = (c.type ?? 'public') as string
    const entryFee   = Number(c.entry_fee ?? 0)
    const rawMax     = c.max_entries ?? c.max_teams
    const maxTeams   = rawMax != null ? Number(rawMax) : null   // null = unlimited
    const platFee    = Number(c.platform_fee_pct ?? 15)
    const entryCount = Number(c.total_entries ?? entryCountMap[id] ?? 0)
    const guaranteed = Boolean(c.is_guaranteed ?? c.guaranteed_prize ?? false)
    const slots      = (c.prize_structure ?? []) as PrizeSlot[]
    const finalPool  = c.final_prize_pool != null ? Number(c.final_prize_pool) : null

    // Open league: prize pool grows live with entries (or is frozen at final_prize_pool)
    const isOpen     = cType === 'open_league'
    const prizePool  = finalPool ??
      (isOpen
        ? netPrizePool(entryFee, entryCount, platFee)       // live pot
        : guaranteed
        ? Number(c.prize_pool ?? netPrizePool(entryFee, maxTeams ?? 10, platFee))
        : netPrizePool(entryFee, entryCount, platFee))

    const prizeDesc = slots.length > 0
      ? slots.map((s: PrizeSlot) => {
          const amt = (prizePool * s.prize_pct / 100).toFixed(2)
          return s.rank_from === s.rank_to ? `${s.rank_from}st: £${amt}` : `${s.rank_from}–${s.rank_to}: £${amt}`
        }).join(' • ')
      : (c.prize_description as string | null) ?? null

    return {
      id,
      name:              (c.name ?? c.title ?? 'Contest') as string,
      type:              'public' as const,
      contest_category:  TYPE_TO_CATEGORY[cType] ?? 'small_league',
      entry_fee:         entryFee,
      prize_pool:        prizePool,
      guaranteed_prize:  guaranteed,
      max_teams:         maxTeams,
      prize_description: prizeDesc,
      entry_count:       entryCount,
      is_joined:         myEnteredIds.has(id),
      final_prize_pool:  finalPool,
    }
  }

  // ── Group contests by match ────────────────────────────────────────────────
  const contestsByMatch: Record<string, LobbyContest[]> = {}
  for (const c of allMatchContests) {
    const mid = c.match_id as string
    if (!contestsByMatch[mid]) contestsByMatch[mid] = []
    contestsByMatch[mid].push(toLobbyCcontest(c))
  }

  const matchGroups: MatchGroup[] = matchList
    .filter((m) => (contestsByMatch[m.id] ?? []).length > 0)
    .map((m, idx) => ({
      matchId:     m.id,
      matchNumber: m.match_number,
      opponent_team: m.opponent_team,
      matchDate:   m.match_date,
      venue:       m.venue ?? null,
      isNext:      idx === 0,
      contests:    contestsByMatch[m.id] ?? [],
    }))

  // Season-level contests go in their own group (no match)
  const seasonLobby = seasonContestList.map(toLobbyCcontest)

  const nextMatch     = matchList[0] ?? null
  const matchLockTime = nextMatch?.match_date ?? null

  // ── GW lobby (with has_team flag) ─────────────────────────────────────────
  const gwLobbyContests = gwContests.map((c) => {
    const base = toLobbyCcontest(c)
    return { ...base, gameweek_id: activeGw?.id ?? null, has_team: myGwContestTeamIds.has(base.id) }
  })

  const gwTyped = activeGw as unknown as { id: string; gameweek_number: number; name: string; start_date: string; end_date: string; deadline: string } | null
  const gwDate = gwTyped
    ? new Date(gwTyped.start_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })
    : null
  const gwDeadlinePassed = gwTyped ? new Date(gwTyped.deadline) <= new Date() : false

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Contests</h1>
          <p className="text-gray-500 text-sm mt-0.5">{season.name}</p>
        </div>
        <Link
          href={`${base}/wallet`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#fef9ee] border border-[#C9A84C]/30 text-[#C9A84C] font-bold text-sm hover:bg-[#fef3d0] transition-colors self-start sm:self-auto"
        >
          💰 Wallet: £{walletBalance.toFixed(2)}
        </Link>
      </div>

      {/* No team warning */}
      {!myTeamId && (
        <div className="rounded-xl bg-[#fef9ee] border border-[#C9A84C]/30 px-4 py-3 text-sm text-[#a8892e] font-medium flex items-center justify-between gap-3">
          <span>Create a fantasy team to join contests.</span>
          <Link href={`${base}/team`} className="bg-[#C9A84C] text-black px-3 py-1.5 rounded-lg text-xs font-black hover:bg-[#a8892e] transition-colors flex-shrink-0">
            Create Team
          </Link>
        </div>
      )}

      {/* ── Gameweek Contests (active GW) ─────────────────────────────────── */}
      {activeGw && gwLobbyContests.length > 0 && (
        <div className="space-y-3">
          {/* GW header */}
          <div className="rounded-2xl bg-gradient-to-r from-[#C9A84C] to-[#a8892e] px-5 py-4 text-black">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">
              Active · {gwDate}
            </p>
            <p className="text-2xl font-black leading-tight">{gwTyped?.name ?? 'Gameweek'}</p>
            {gwPlayerCount > 0 ? (
              <p className="text-base font-black mt-0.5">{gwPlayerCount} players available</p>
            ) : (
              <p className="text-sm opacity-70 mt-0.5">Team sheet not yet confirmed</p>
            )}
            <p className="text-xs opacity-60 mt-1">
              {gwLobbyContests.length} contest{gwLobbyContests.length !== 1 ? 's' : ''} · Pick a fresh XI for each you enter
            </p>
          </div>

          {/* ── This Gameweek — match strip ──────────────────────────────── */}
          {gwMatches.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-0.5">
                This Gameweek · {gwMatches.length} match{gwMatches.length !== 1 ? 'es' : ''}
              </p>
              <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                {gwMatches.map((m) => {
                  const ourXI    = m.our_team?.replace(/^Slough CC\s*[-–]\s*/i, '') ?? m.our_team
                  const opponent = m.opponent_team?.replace(/\s*-\s*\d+st XI|\s*-\s*\d+nd XI|\s*-\s*\d+rd XI|\s*-\s*\d+th XI/i, '').replace(/\s+CC$/, ' CC') ?? m.opponent_team
                  const kickoff  = new Date(m.match_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
                  return (
                    <div
                      key={m.id}
                      className="flex-shrink-0 w-48 rounded-xl border border-[#C9A84C]/20 bg-black/10 backdrop-blur-sm px-3.5 py-3 space-y-1.5"
                    >
                      {/* Teams */}
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black text-black leading-tight truncate">{ourXI}</p>
                        <p className="text-[9px] font-bold text-black/50 uppercase tracking-widest">vs</p>
                        <p className="text-[11px] font-black text-black leading-tight truncate">{opponent}</p>
                      </div>
                      {/* Venue + time */}
                      <div className="border-t border-[#C9A84C]/20 pt-1.5 space-y-0.5">
                        {m.venue && (
                          <p className="text-[9px] text-black/60 truncate">{m.venue}</p>
                        )}
                        <p className="text-[10px] font-bold text-black/80">🕐 {kickoff}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* GW contest cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            {gwLobbyContests.map((c) => {
              const isFree      = c.entry_fee === 0
              const isUnlimited = c.max_teams == null
              const isFull      = !isUnlimited && c.entry_count >= c.max_teams!
              const pct         = !isUnlimited && c.max_teams! > 0 ? Math.min(100, Math.round((c.entry_count / c.max_teams!) * 100)) : 0
              const isOpen      = c.contest_category === 'open_league'
              const isLocked    = gwDeadlinePassed
              const isGrowing   = isOpen && !c.final_prize_pool && !isLocked
              const isJoined    = c.is_joined
              const hasTeam     = (c as typeof c & { has_team?: boolean }).has_team ?? false
              return (
                <Link
                  key={c.id}
                  href={`${base}/contests/${c.id}`}
                  className={cn(
                    'block rounded-2xl border-2 px-5 py-4 transition-all hover:shadow-md',
                    isJoined
                      ? 'border-green-300 bg-green-50'
                      : isOpen
                      ? 'border-violet-200 bg-violet-50/20 hover:border-violet-400/50'
                      : 'border-gray-200 bg-white hover:border-[#C9A84C]/50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-800 truncate">{c.name}</p>
                      {isJoined ? (
                        <span className="text-[10px] font-black text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ Entered{hasTeam ? ' · Team saved' : ''}</span>
                      ) : isLocked ? (
                        <span className="text-[10px] font-black text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">🔒 Closed</span>
                      ) : isOpen ? (
                        <span className="text-[10px] font-black text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">🌐 Open League · Unlimited</span>
                      ) : (
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#C9A84C]">🏏 Pick XI to enter</span>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {isGrowing ? (
                        <>
                          <p className="text-lg font-black text-violet-600 tabular-nums">
                            £{(c.entry_count * Number(c.entry_fee) * 0.85).toFixed(2)}
                          </p>
                          <p className="text-[10px] text-violet-400 animate-pulse">pot growing…</p>
                        </>
                      ) : (
                        <>
                          <p className="text-lg font-black text-[#C9A84C] tabular-nums">
                            {c.prize_pool > 0 ? `£${c.prize_pool % 1 === 0 ? c.prize_pool : c.prize_pool.toFixed(2)}` : '—'}
                          </p>
                          <p className="text-[10px] text-gray-400">{isOpen ? 'final pot' : 'prize pool'}</p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-1.5 text-xs">
                    {isUnlimited ? (
                      <span className="text-gray-500">
                        <span className="font-bold text-gray-700">{c.entry_count}</span> joined · <span className="text-violet-600 font-semibold">unlimited spots</span>
                      </span>
                    ) : (
                      <span className="text-gray-500">{c.entry_count}/{c.max_teams} spots</span>
                    )}
                    <span className={cn('font-bold', isFree ? 'text-green-600' : 'text-[#C9A84C]')}>
                      {isFree ? 'Free' : `£${Number(c.entry_fee).toFixed(2)}`}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    {isUnlimited ? (
                      <div className={cn('h-full rounded-full bg-violet-400', isLocked ? 'opacity-40' : 'animate-pulse')} style={{ width: '100%' }} />
                    ) : (
                      <div
                        className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-red-400' : pct >= 80 ? 'bg-orange-400' : 'bg-[#C9A84C]')}
                        style={{ width: `${pct}%` }}
                      />
                    )}
                  </div>
                  {isFull && !isLocked && <p className="text-xs text-red-500 font-bold mt-1.5">Full — no spots left</p>}
                  {isLocked && !isJoined && <p className="text-xs text-gray-400 font-semibold mt-1.5">Entries closed at deadline</p>}
                </Link>
              )
            })}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 pt-2">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400 flex-shrink-0">All Contests</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
        </div>
      )}

      {/* Client component handles filtering, sorting, and rendering */}
      <ContestPageClient
        matchGroups={matchGroups}
        seasonContests={seasonLobby}
        walletBalance={walletBalance}
        fantasyTeamId={myTeamId}
        matchLockTime={matchLockTime}
        clubSlug={slug}
      />
    </div>
  )
}
