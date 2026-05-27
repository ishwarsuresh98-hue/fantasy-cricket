import { createClient } from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ContestLobby from '@/components/ContestLobby'
import { cn } from '@/lib/utils'
import { netPrizePool, type PrizeSlot } from '@/lib/prizes'
import type { ContestCategory } from '@/types'

// Map DB contest type → ContestLobby's ContestCategory
const TYPE_TO_CATEGORY: Record<string, ContestCategory> = {
  head_to_head:   'h2h',
  small_league:   'small_league',
  mega:           'mega',
  winner_takes_all: 'jackpot',
  practice:       'practice',
  // legacy public/private
  public:         'small_league',
  private:        'small_league',
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
    supabase.from('fantasy_teams').select('id').eq('season_id', season.id).eq('user_id', user!.id).maybeSingle(),
    supabase.from('wallets').select('balance').eq('user_id', user!.id).maybeSingle(),
  ])
  const myTeamId      = myTeam?.id ?? null
  const walletBalance = (wallet?.balance ?? 0) as number

  // ── Upcoming matches (for this club, ordered by date) ─────────────────────
  const { data: upcomingMatches } = await supabase
    .from('matches')
    .select('id, match_number, opponent, match_date, venue, status')
    .eq('season_id', season.id)
    .eq('status', 'upcoming')
    .order('match_date', { ascending: true })
    .limit(5)

  const nextMatch = upcomingMatches?.[0] ?? null

  // ── Open contests for the next match ──────────────────────────────────────
  let rawContests: Record<string, unknown>[] = []
  if (nextMatch) {
    const { data } = await supabase
      .from('contests')
      .select('*')
      .eq('match_id', nextMatch.id)
      .or('status.eq.open,status.is.null')   // open or old rows without status
      .order('entry_fee', { ascending: true })
    rawContests = (data ?? []) as Record<string, unknown>[]
  }

  // ── Also fetch old-style season-level public contests ─────────────────────
  const { data: seasonContests } = await supabase
    .from('contests')
    .select('*')
    .eq('season_id', season.id)
    .is('match_id', null)
    .or('status.eq.open,status.is.null')
    .order('created_at', { ascending: false })
  const allContests = [...rawContests, ...((seasonContests ?? []) as Record<string, unknown>[])]

  const contestIds = allContests.map((c) => c.id as string)

  // ── Entry counts + whether user has joined ─────────────────────────────────
  const { data: allEntries } = contestIds.length > 0
    ? await supabase
        .from('contest_entries')
        .select('contest_id, fantasy_team_id')
        .in('contest_id', contestIds)
    : { data: [] }

  const entryCountMap: Record<string, number> = {}
  const myEnteredIds  = new Set<string>()
  for (const entry of allEntries ?? []) {
    const e = entry as { contest_id: string; fantasy_team_id: string }
    entryCountMap[e.contest_id] = (entryCountMap[e.contest_id] ?? 0) + 1
    if (myTeamId && e.fantasy_team_id === myTeamId) myEnteredIds.add(e.contest_id)
  }

  // ── Map to LobbyContest interface ─────────────────────────────────────────
  const lobbyContests = allContests.map((c) => {
    const id          = c.id as string
    const name        = (c.name ?? c.title ?? 'Contest') as string
    const cType       = (c.type ?? 'public') as string
    const entryFee    = (c.entry_fee ?? 0) as number
    const maxTeams    = (c.max_entries ?? c.max_teams ?? 10) as number
    const platFee     = (c.platform_fee_pct ?? 15) as number
    const entryCount  = (c.total_entries ?? entryCountMap[id] ?? 0) as number
    const guaranteed  = ((c.is_guaranteed ?? c.guaranteed_prize ?? false)) as boolean
    const slots       = (c.prize_structure ?? []) as PrizeSlot[]
    const prizePool   = guaranteed
      ? (c.prize_pool ?? netPrizePool(entryFee, maxTeams, platFee)) as number
      : netPrizePool(entryFee, entryCount, platFee)

    // Build prize_description from prize_structure JSONB
    const prizeDesc = slots.length > 0
      ? slots.map((s: PrizeSlot) => {
          const amt = (prizePool * s.prize_pct / 100).toFixed(2)
          return s.rank_from === s.rank_to
            ? `${s.rank_from}st: £${amt}`
            : `${s.rank_from}–${s.rank_to}: £${amt}`
        }).join(' • ')
      : (c.prize_description as string | null) ?? null

    return {
      id,
      name,
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
  })

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
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#fef9ee] border border-[#C9A84C]/30 text-[#C9A84C] font-bold text-sm hover:bg-[#fef3d0] transition-colors"
        >
          💰 Wallet: £{walletBalance.toFixed(2)}
        </Link>
      </div>

      {/* Next match banner */}
      {nextMatch ? (
        <div className="rounded-2xl bg-gradient-to-r from-[#C9A84C] to-[#a8892e] px-5 py-4 text-black">
          <p className="text-xs font-bold uppercase tracking-widest opacity-70">Next Match · GW{nextMatch.match_number}</p>
          <p className="text-xl font-black mt-0.5">vs {nextMatch.opponent}</p>
          <p className="text-sm opacity-80 mt-0.5">
            {new Date(nextMatch.match_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}
            {nextMatch.venue ? ` · ${nextMatch.venue}` : ''}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-gray-100 border border-gray-200 px-5 py-4 text-center">
          <p className="text-gray-500 text-sm">No upcoming matches scheduled.</p>
        </div>
      )}

      {/* No team warning */}
      {!myTeamId && (
        <div className="rounded-xl bg-[#fef9ee] border border-[#C9A84C]/30 px-4 py-3 text-sm text-[#a8892e] font-medium flex items-center justify-between gap-3">
          <span>Create a fantasy team to join contests.</span>
          <Link href={`${base}/team`} className="bg-[#C9A84C] text-black px-3 py-1.5 rounded-lg text-xs font-black hover:bg-[#a8892e] transition-colors">
            Create Team
          </Link>
        </div>
      )}

      {/* Contest lobby */}
      {lobbyContests.length > 0 ? (
        <ContestLobby
          initialContests={lobbyContests}
          walletBalance={walletBalance}
          fantasyTeamId={myTeamId}
          matchLockTime={matchLockTime}
          matchId={nextMatch?.id}
          clubSlug={slug}
        />
      ) : (
        <div className="rounded-2xl bg-gray-50 border border-gray-200 py-16 text-center">
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-gray-500 font-medium">No contests available yet.</p>
          <p className="text-gray-400 text-sm mt-1">Check back once contests are published for the next match.</p>
        </div>
      )}

      {/* Match selector for other upcoming matches */}
      {(upcomingMatches?.length ?? 0) > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Other Upcoming Matches</p>
          <div className="flex flex-wrap gap-2">
            {upcomingMatches!.slice(1).map((m) => (
              <div key={m.id} className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold border',
                'bg-white border-gray-200 text-gray-500',
              )}>
                GW{m.match_number} vs {m.opponent}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
