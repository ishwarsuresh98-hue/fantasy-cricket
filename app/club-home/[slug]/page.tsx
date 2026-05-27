import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Club } from '@/types'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: club } = await supabase
    .from('clubs')
    .select('name, location')
    .eq('slug', slug)
    .single()

  if (!club) return {}
  return {
    title: `${club.name} Fantasy Cricket`,
    description: `Pick your team, join contests, and compete for prizes with ${club.name} Fantasy Cricket.`,
  }
}

export default async function ClubPublicHomePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  // ── Club ──────────────────────────────────────────────────────────────────
  const { data: clubRow } = await supabase
    .from('clubs')
    .select('id, name, slug, logo_url, location, primary_color')
    .eq('slug', slug)
    .single()

  if (!clubRow) notFound()
  const club = clubRow as Club

  // ── Active season for this club ───────────────────────────────────────────
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('club_id', club.id)
    .eq('is_active', true)
    .single()

  // ── Upcoming matches ──────────────────────────────────────────────────────
  const upcomingMatches = season
    ? await supabase
        .from('matches')
        .select('id, match_number, opponent, match_date, venue, status')
        .eq('season_id', season.id)
        .eq('status', 'upcoming')
        .order('match_date', { ascending: true })
        .limit(4)
        .then(({ data }) => data ?? [])
    : []

  // ── Open contests for next match ──────────────────────────────────────────
  const nextMatch = upcomingMatches[0] ?? null
  const openContests = nextMatch
    ? await supabase
        .from('contests')
        .select('id, name, entry_fee, prize_pool, max_teams, type')
        .eq('match_id', nextMatch.id)
        .or('status.eq.open,status.is.null')
        .order('entry_fee', { ascending: true })
        .limit(6)
        .then(({ data }) => data ?? [])
    : []

  const brandColor = club.primary_color ?? '#C9A84C'

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header
        className="relative overflow-hidden px-6 py-14 text-center"
        style={{ background: `linear-gradient(135deg, ${brandColor}18 0%, #ffffff 60%)` }}
      >
        {/* Subtle pattern */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />

        <div className="relative z-10 max-w-2xl mx-auto">
          {/* Club logo */}
          <div className="flex justify-center mb-5">
            {club.logo_url ? (
              <div className="w-24 h-24 rounded-full overflow-hidden bg-white shadow-lg ring-4 ring-white p-1">
                <Image
                  src={club.logo_url}
                  alt={`${club.name} crest`}
                  width={96}
                  height={96}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-24 h-24 rounded-full bg-white shadow-lg ring-4 ring-white flex items-center justify-center text-4xl">
                🏏
              </div>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
            {club.name}
          </h1>
          <p className="text-gray-500 mt-2">
            Fantasy Cricket {season ? `· ${season.name}` : ''}
          </p>
          {club.location && (
            <p className="text-gray-400 text-sm mt-1">📍 {club.location}</p>
          )}

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <Link
              href="/login"
              className="w-full sm:w-auto px-8 py-3 rounded-xl font-black text-sm shadow-lg transition-all hover:opacity-90 hover:-translate-y-0.5 active:scale-[0.98]"
              style={{ background: brandColor, color: '#000' }}
            >
              Sign in to play
            </Link>
            <Link
              href="/signup"
              className="w-full sm:w-auto px-8 py-3 rounded-xl border-2 border-gray-200 text-gray-700 font-bold text-sm hover:border-gray-300 transition-colors"
            >
              Create account — it&apos;s free
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 pb-16 space-y-12">

        {/* ── Upcoming matches ──────────────────────────────────────────── */}
        {upcomingMatches.length > 0 && (
          <section>
            <SectionHeader title="Upcoming Fixtures" icon="📅" />
            <div className="grid sm:grid-cols-2 gap-3">
              {upcomingMatches.map((match, i) => (
                <div
                  key={match.id}
                  className={`rounded-2xl border p-5 ${i === 0 ? 'border-[#C9A84C]/40 bg-[#fef9ee]' : 'border-gray-200 bg-gray-50'}`}
                >
                  {i === 0 && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#C9A84C] mb-2">
                      Next Match
                    </p>
                  )}
                  <p className="font-black text-gray-900 text-lg">vs {match.opponent}</p>
                  <p className="text-gray-500 text-sm mt-0.5">
                    GW{match.match_number} ·{' '}
                    {new Date(match.match_date).toLocaleDateString('en-GB', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </p>
                  {match.venue && (
                    <p className="text-gray-400 text-xs mt-0.5">📍 {match.venue}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Open contests ─────────────────────────────────────────────── */}
        {openContests.length > 0 && (
          <section>
            <SectionHeader
              title={nextMatch ? `Contests — GW${nextMatch.match_number} vs ${nextMatch.opponent}` : 'Open Contests'}
              icon="🏆"
            />
            <div className="grid sm:grid-cols-2 gap-3">
              {(openContests as Record<string, unknown>[]).map((contest) => {
                const entryFee  = Number(contest.entry_fee ?? 0)
                const prizePool = Number(contest.prize_pool ?? 0)
                return (
                  <div
                    key={contest.id as string}
                    className="rounded-2xl bg-white border-2 border-gray-100 p-5 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 truncate">{contest.name as string}</p>
                      {prizePool > 0 && (
                        <p className="text-[#C9A84C] font-black text-lg">
                          £{prizePool % 1 === 0 ? prizePool : prizePool.toFixed(2)} pool
                        </p>
                      )}
                      <p className="text-gray-400 text-xs mt-0.5">
                        Up to {contest.max_teams as number} teams
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {entryFee === 0 ? (
                        <span className="text-xs font-black text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                          FREE
                        </span>
                      ) : (
                        <span className="text-sm font-black text-gray-800">
                          £{entryFee.toFixed(2)}
                        </span>
                      )}
                      <Link
                        href="/login"
                        className="px-4 py-1.5 rounded-xl text-xs font-black transition-colors"
                        style={{ background: brandColor, color: '#000' }}
                      >
                        Join →
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Sign-in nudge */}
            <div className="mt-4 rounded-2xl bg-gray-50 border border-gray-200 px-6 py-5 text-center">
              <p className="text-gray-600 font-medium">
                Sign in to join contests, pick your team, and compete for prizes.
              </p>
              <div className="flex justify-center gap-3 mt-4">
                <Link
                  href="/login"
                  className="px-6 py-2 rounded-xl font-black text-sm transition-colors hover:opacity-90"
                  style={{ background: brandColor, color: '#000' }}
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="px-6 py-2 rounded-xl border-2 border-gray-200 text-gray-700 font-bold text-sm hover:border-gray-300 transition-colors"
                >
                  Create account
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {upcomingMatches.length === 0 && openContests.length === 0 && (
          <div className="text-center py-24">
            <div className="text-5xl mb-4">🏏</div>
            <h2 className="text-xl font-bold text-gray-700">Season coming soon</h2>
            <p className="text-gray-400 mt-2">
              Check back once the season is underway for fixtures and contests.
            </p>
            <Link
              href="/login"
              className="inline-block mt-6 px-7 py-3 rounded-xl font-black text-sm transition-colors hover:opacity-90"
              style={{ background: brandColor, color: '#000' }}
            >
              Sign in to play
            </Link>
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-6 px-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-400">
            {club.name} Fantasy Cricket · Powered by{' '}
            <Link href="https://the-xi.app" className="text-[#C9A84C] hover:underline font-medium">
              The XI
            </Link>
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <Link href="/login" className="hover:text-gray-600 transition-colors">Sign in</Link>
            <Link href="/signup" className="hover:text-gray-600 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ── Shared section header ─────────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xl">{icon}</span>
      <h2 className="text-lg font-black text-gray-900">{title}</h2>
    </div>
  )
}
