import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import type { Club } from '@/types'

export const metadata = {
  title: 'The XI — Fantasy Cricket Platform',
  description: 'The home of fantasy cricket. Join your club, pick your team, and compete for prizes.',
}

export default async function XiHomePage() {
  const supabase = await createClient()

  const { data: clubs } = await supabase
    .from('clubs')
    .select('id, name, slug, logo_url, location, primary_color')
    .order('name')

  const clubList = (clubs ?? []) as Club[]

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="px-6 pt-14 pb-10 text-center">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/the-xi-logo.svg"
            alt="The XI"
            className="h-24 w-auto drop-shadow-md"
          />
        </div>

        <h1 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight">
          The <span className="text-[#C9A84C]">XI</span>
        </h1>
        <p className="text-gray-500 mt-3 text-lg">
          The home of fantasy cricket.
        </p>

        {/* Auth CTAs */}
        <div className="flex items-center justify-center gap-3 mt-7">
          <Link
            href="/login"
            className="px-6 py-2.5 rounded-xl bg-[#C9A84C] text-black font-black text-sm hover:bg-[#a8892e] transition-colors shadow-md shadow-[#C9A84C]/20"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="px-6 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-bold text-sm hover:border-[#C9A84C]/50 hover:text-[#C9A84C] transition-colors"
          >
            Create account
          </Link>
        </div>
      </header>

      {/* ── Clubs grid ─────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 pb-16">

        {clubList.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-5xl mb-4">🏏</div>
            <p className="text-gray-400 text-lg">No clubs yet — check back soon.</p>
          </div>
        ) : (
          <>
            <p className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 mb-6">
              Pick your club
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {clubList.map((club) => (
                <ClubCard key={club.id} club={club} />
              ))}
            </div>
          </>
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

// ── Club card ──────────────────────────────────────────────────────────────────

function ClubCard({ club }: { club: Club }) {
  return (
    <Link
      href={`/clubs/${club.slug}/dashboard`}
      className="group relative overflow-hidden rounded-2xl bg-white border-2 border-gray-100 p-7 flex flex-col items-center text-center gap-5 transition-all duration-200 hover:border-[#C9A84C]/50 hover:shadow-xl hover:shadow-[#C9A84C]/8 hover:-translate-y-0.5 active:scale-[0.98]"
    >
      {/* Logo / placeholder */}
      {club.logo_url ? (
        <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-50 p-1 shadow ring-2 ring-gray-100 group-hover:ring-[#C9A84C]/30 transition-all">
          <Image
            src={club.logo_url}
            alt={`${club.name} crest`}
            width={80}
            height={80}
            className="w-full h-full object-contain"
          />
        </div>
      ) : (
        <div className="w-20 h-20 rounded-full bg-gray-50 border-2 border-gray-100 flex items-center justify-center text-3xl group-hover:border-[#C9A84C]/30 transition-colors">
          🏏
        </div>
      )}

      {/* Club info */}
      <div className="min-w-0 w-full">
        <h2 className="text-gray-900 font-black text-lg leading-tight group-hover:text-[#C9A84C] transition-colors">
          {club.name}
        </h2>
        {club.location && (
          <p className="text-gray-400 text-sm mt-1 flex items-center justify-center gap-1">
            <span>📍</span>
            {club.location}
          </p>
        )}
      </div>

      {/* CTA */}
      <span className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gray-50 border-2 border-gray-100 text-gray-600 text-sm font-bold group-hover:bg-[#C9A84C] group-hover:border-[#C9A84C] group-hover:text-black transition-all">
        Play →
      </span>
    </Link>
  )
}
