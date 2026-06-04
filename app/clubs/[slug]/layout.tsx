import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import Navbar from '@/components/nav/Navbar'
import OnboardingGuide from '@/components/OnboardingGuide'
import type { Profile } from '@/types'

interface ClubLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function ClubLayout({ children, params }: ClubLayoutProps) {
  const { slug } = await params
  const supabase  = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch club
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  // Fetch / ensure profile
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    const displayName =
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split('@')[0] ??
      'User'
    const { error: insertErr } = await supabase
      .from('profiles')
      .insert({ id: user.id, display_name: displayName })

    if (!insertErr) {
      const { data: created } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      profile = created
    }
  }

  if (!profile) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  const p = profile as Profile

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar profile={p} club={club} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      {/* OnboardingGuide: opens automatically for new users, "?" button always visible */}
      <OnboardingGuide
        userId={user.id}
        defaultOpen={!p.onboarding_complete}
      />
    </div>
  )
}
