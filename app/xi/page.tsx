import { createClient }  from '@/lib/supabase/server'
import Link               from 'next/link'
import Image              from 'next/image'
import type { Club }      from '@/types'
import XiContestFeed      from '@/components/xi/XiContestFeed'

export const metadata = {
  title: 'The XI — Fantasy Cricket Marketplace',
  description: 'The home of fantasy cricket. Browse contests from every club, pick your team and compete for prizes.',
}

// ── Types shared with the client component ────────────────────────────────────

export interface XiContest {
  id:             string
  name:           string
  club_name:      string
  club_slug:      string
  club_logo:      string | null
  match_label:    string          // e.g. "Slough CC vs Harefield CC"
  match_date:     string | null
  entry_fee:      number
  prize_pool:     number
  max_teams:      number
  entry_count:    number
  contest_type:   string          // raw DB type field
  guaranteed:     boolean
  status:         string
}

// ── Server component ──────────────────────────────────────────────────────────

export default async function XiHomePage() {
  const supabase = await createClient()

  // ── Clubs ─────────────────────────────────────────────────────────────────
  const { data: clubs } = await supabase
    .from('clubs')
    .select('id, name, slug, logo_url, location, primary_color')
    .order('name')
  const clubList = (clubs ?? []) as Club[]

  // Build a fast lookup: club_id → club
  const clubById = new Map<string, Club>(clubList.map((c) => [c.id, c]))

  // ── All open contests with match info ─────────────────────────────────────
  const { data: rawContests } = await supabase
    .from('contests')
    .select('id, name, title, type, entry_fee, prize_pool, max_teams, max_entries, total_entries, guaranteed_prize, is_guaranteed, status, match_id, season_id, club_id')
    .or('status.eq.open,status.is.null')
    .order('entry_fee', { ascending: true })

  // ── Match details for all relevant match_ids ──────────────────────────────
  const matchIds = [...new Set(
    (rawContests ?? []).map((c) => c.match_id as string | null).filter(Boolean) as string[]
  )]

  const matchMap = new Map<string, { opponent_team: string; match_date: string; season_id: string }>()
  if (matchIds.length > 0) {
    const { data: matches } = await supabase
      .from('matches')
      .select('id, opponent_team, match_date, season_id')
      .in('id', matchIds)
    for (const m of matches ?? []) {
      matchMap.set(m.id, { opponent_team: m.opponent_team, match_date: m.match_date, season_id: m.season_id })
    }
  }

  // ── Season → club_id lookup ────────────────────────────────────────────────
  const seasonIds = [...new Set(
    (rawContests ?? []).map((c) => c.season_id as string | null).filter(Boolean) as string[]
  )]
  // Also grab season ids from matched matches
  for (const m of matchMap.values()) {
    if (m.season_id) seasonIds.push(m.season_id)
  }
  const uniqueSeasonIds = [...new Set(seasonIds)]

  const seasonClubMap = new Map<string, string>() // season_id → club_id
  if (uniqueSeasonIds.length > 0) {
    const { data: seasons } = await supabase
      .from('seasons')
      .select('id, club_id')
      .in('id', uniqueSeasonIds)
    for (const s of seasons ?? []) {
      seasonClubMap.set(s.id, s.club_id)
    }
  }

  // ── Entry counts ───────────────────────────────────────────────────────────
  const contestIds = (rawContests ?? []).map((c) => c.id as string)
  const entryCountMap: Record<string, number> = {}
  if (contestIds.length > 0) {
    const { data: entries } = await supabase
      .from('contest_entries')
      .select('contest_id')
      .in('contest_id', contestIds)
    for (const e of entries ?? []) {
      const cid = e.contest_id as string
      entryCountMap[cid] = (entryCountMap[cid] ?? 0) + 1
    }
  }

  // ── Resolve club for each contest ──────────────────────────────────────────
  // Priority: contest.club_id → match → season → fallback
  const xiContests: XiContest[] = (rawContests ?? []).map((c) => {
    const cId      = c.id as string
    const matchId  = c.match_id as string | null
    const match    = matchId ? matchMap.get(matchId) : undefined

    // Resolve club_id
    let clubId = c.club_id as string | null
    if (!clubId && match?.season_id) clubId = seasonClubMap.get(match.season_id) ?? null
    if (!clubId && c.season_id)      clubId = seasonClubMap.get(c.season_id as string) ?? null

    const club = clubId ? clubById.get(clubId) : undefined

    const entryFee   = Number(c.entry_fee ?? 0)
    const maxTeams   = Number(c.max_entries ?? c.max_teams ?? 10)
    const entryCount = Number(c.total_entries ?? entryCountMap[cId] ?? 0)
    const prizePool  = Number(c.prize_pool ?? 0)

    const clubName   = club?.name ?? 'Unknown Club'
    const matchLabel = match
      ? `${clubName} vs ${match.opponent_team}`
      : clubName

    return {
      id:           cId,
      name:         (c.name ?? c.title ?? 'Contest') as string,
      club_name:    clubName,
      club_slug:    club?.slug ?? '',
      club_logo:    club?.logo_url ?? null,
      match_label:  matchLabel,
      match_date:   match?.match_date ?? null,
      entry_fee:    entryFee,
      prize_pool:   prizePool,
      max_teams:    maxTeams,
      entry_count:  entryCount,
      contest_type: (c.type ?? 'public') as string,
      guaranteed:   Boolean(c.is_guaranteed ?? c.guaranteed_prize ?? false),
      status:       (c.status ?? 'open') as string,
    }
  })

  // ── Live stats ─────────────────────────────────────────────────────────────
  const totalContests  = xiContests.length
  const totalPrizePool = xiContests.reduce((s, c) => s + c.prize_pool, 0)

  const { count: playerCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden bg-gradient-to-b from-gray-50 to-white border-b border-gray-100 px-6 py-12 text-center">
        <div
          className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #C9A84C 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        />
        <div className="relative z-10 max-w-xl mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/the-xi-logo.svg" alt="The XI" className="h-20 w-auto mx-auto mb-5 drop-shadow" />
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight leading-none">
            The <span className="text-[#C9A84C]">XI</span>
          </h1>
          <p className="text-gray-500 mt-3 text-lg">The home of fantasy cricket.</p>
          <div className="flex items-center justify-center gap-3 mt-7">
            <Link href="/login" className="px-7 py-2.5 rounded-xl bg-[#C9A84C] text-black font-black text-sm hover:bg-[#a8892e] transition-colors shadow-md shadow-[#C9A84C]/20">
              Sign in
            </Link>
            <Link href="/signup" className="px-7 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-bold text-sm hover:border-[#C9A84C]/50 hover:text-[#C9A84C] transition-colors">
              Create account
            </Link>
          </div>
        </div>
      </header>

      {/* ── Live stats bar ─────────────────────────────────────────────────── */}
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 grid grid-cols-3 divide-x divide-gray-100">
          <StatCell
            value={totalContests.toString()}
            label="Active Contests"
            icon="🏆"
          />
          <StatCell
            value={totalPrizePool > 0 ? `£${totalPrizePool >= 1000 ? (totalPrizePool / 1000).toFixed(1) + 'K' : totalPrizePool.toFixed(0)}` : '—'}
            label="Total Prize Pool"
            icon="💰"
          />
          <StatCell
            value={(playerCount ?? 0).toString()}
            label="Players Registered"
            icon="👥"
          />
        </div>
      </div>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 space-y-12">

        {/* ── Contest feed (client — handles filtering) ─────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xl">🏏</span>
            <h2 className="text-xl font-black text-gray-900">All Contests</h2>
            {totalContests > 0 && (
              <span className="ml-1 text-xs font-black text-[#C9A84C] bg-[#fef9ee] border border-[#C9A84C]/30 px-2 py-0.5 rounded-full">
                {totalContests}
              </span>
            )}
          </div>
          <XiContestFeed contests={xiContests} />
        </section>

        {/* ── Clubs grid ──────────────────────────────────────────────────── */}
        {clubList.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xl">🏟️</span>
              <h2 className="text-xl font-black text-gray-900">Pick Your Club</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {clubList.map((club) => (
                <ClubCard key={club.id} club={club} />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-6 text-center">
        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} The XI · Fantasy Cricket Platform
        </p>
      </footer>
    </div>
  )
}

// ── Stat cell ─────────────────────────────────────────────────────────────────

function StatCell({ value, label, icon }: { value: string; label: string; icon: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-1">
      <span className="text-lg">{icon}</span>
      <span className="text-xl sm:text-2xl font-black text-gray-900 tabular-nums">{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
    </div>
  )
}

// ── Club card ─────────────────────────────────────────────────────────────────

function ClubCard({ club }: { club: Club }) {
  return (
    <Link
      href={`/clubs/${club.slug}/dashboard`}
      className="group relative overflow-hidden rounded-2xl bg-white border-2 border-gray-100 p-6 flex flex-col items-center text-center gap-4 transition-all duration-200 hover:border-[#C9A84C]/50 hover:shadow-xl hover:shadow-[#C9A84C]/8 hover:-translate-y-0.5 active:scale-[0.98]"
    >
      {club.logo_url ? (
        <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-50 p-1 shadow ring-2 ring-gray-100 group-hover:ring-[#C9A84C]/30 transition-all">
          <Image src={club.logo_url} alt={`${club.name} crest`} width={64} height={64} className="w-full h-full object-contain" />
        </div>
      ) : (
        <div className="w-16 h-16 rounded-full bg-gray-50 border-2 border-gray-100 flex items-center justify-center text-2xl group-hover:border-[#C9A84C]/30 transition-colors">
          🏏
        </div>
      )}
      <div className="min-w-0 w-full">
        <h3 className="text-gray-900 font-black text-base leading-tight group-hover:text-[#C9A84C] transition-colors">{club.name}</h3>
        {club.location && <p className="text-gray-400 text-xs mt-0.5">📍 {club.location}</p>}
      </div>
      <span className="inline-flex items-center gap-1 px-4 py-1.5 rounded-xl bg-gray-50 border-2 border-gray-100 text-gray-600 text-xs font-bold group-hover:bg-[#C9A84C] group-hover:border-[#C9A84C] group-hover:text-black transition-all">
        Play →
      </span>
    </Link>
  )
}
