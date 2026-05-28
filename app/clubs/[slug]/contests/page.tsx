import { createClient }    from '@/lib/supabase/server'
import { getClubBySlug }  from '@/lib/club'
import { notFound }       from 'next/navigation'
import Link               from 'next/link'
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

  // ── All upcoming matches ───────────────────────────────────────────────────
  const { data: upcomingMatches } = await supabase
    .from('matches')
    .select('id, match_number, opponent, match_date, venue, status')
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
    const maxTeams   = Number(c.max_entries ?? c.max_teams ?? 10)
    const platFee    = Number(c.platform_fee_pct ?? 15)
    const entryCount = Number(c.total_entries ?? entryCountMap[id] ?? 0)
    const guaranteed = Boolean(c.is_guaranteed ?? c.guaranteed_prize ?? false)
    const slots      = (c.prize_structure ?? []) as PrizeSlot[]
    const prizePool  = guaranteed
      ? Number(c.prize_pool ?? netPrizePool(entryFee, maxTeams, platFee))
      : netPrizePool(entryFee, entryCount, platFee)

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
      opponent:    m.opponent,
      matchDate:   m.match_date,
      venue:       m.venue ?? null,
      isNext:      idx === 0,
      contests:    contestsByMatch[m.id] ?? [],
    }))

  // Season-level contests go in their own group (no match)
  const seasonLobby = seasonContestList.map(toLobbyCcontest)

  const nextMatch     = matchList[0] ?? null
  const matchLockTime = nextMatch?.match_date ?? null

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
