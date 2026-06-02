import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Club } from '@/types'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch all clubs
  const { data: clubs } = await supabase
    .from('clubs')
    .select('id, name, slug, logo_url, location, primary_color')
    .order('name')

  // If only one club, redirect straight to it
  if ((clubs ?? []).length === 1) {
    redirect(`/clubs/${(clubs as Club[])[0].slug}/dashboard`)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="px-6 py-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#0b0b0b]/40 mb-2">
          Welcome to
        </p>
        <h1 className="text-5xl font-black text-[#0b0b0b] tracking-tight">
          The <span className="text-[#C9A84C]">XI</span>
        </h1>
        <p className="text-[#0b0b0b]/50 mt-2 text-sm">
          Fantasy cricket. One platform. Every club.
        </p>
      </header>

      {/* Clubs grid */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 pb-12">
        {(!clubs || clubs.length === 0) ? (
          <div className="text-center py-24">
            <div className="text-5xl mb-4">🏏</div>
            <p className="text-[#0b0b0b]/50">No clubs have been added yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(clubs as Club[]).map((club) => (
              <Link
                key={club.id}
                href={`/clubs/${club.slug}/dashboard`}
                className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-[#f5f5f5]/5 p-6 transition-all hover:border-[#C9A84C]/40 hover:bg-[#f5f5f5]/10 hover:shadow-xl hover:shadow-[#C9A84C]/10 active:scale-[0.98]"
              >
                {/* Subtle gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center text-center gap-4">
                  {/* Logo or placeholder */}
                  {club.logo_url ? (
                    <div className="w-20 h-20 rounded-full overflow-hidden bg-[#f0f0f0] p-1 shadow-lg">
                      <Image
                        src={club.logo_url}
                        alt={`${club.name} crest`}
                        width={80}
                        height={80}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-[#f5f5f5]/10 flex items-center justify-center text-3xl">
                      🏏
                    </div>
                  )}

                  <div>
                    <h2 className="text-[#0b0b0b] font-bold text-lg leading-tight group-hover:text-[#C9A84C] transition-colors">
                      {club.name}
                    </h2>
                    {club.location && (
                      <p className="text-[#0b0b0b]/40 text-sm mt-0.5">{club.location}</p>
                    )}
                  </div>

                  <span className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#f5f5f5]/10 text-[#0b0b0b]/80 text-sm font-semibold group-hover:bg-[#C9A84C] group-hover:text-[#0b0b0b] transition-all">
                    Play →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
