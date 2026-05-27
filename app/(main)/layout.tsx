import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/nav/Navbar'
import OnboardingTour from '@/components/OnboardingTour'
import type { Profile } from '@/types'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Profile missing (DB trigger didn't fire on signup) — create it now.
  // Requires "Users can insert own profile" RLS policy to exist.
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

  // If still no profile after attempted creation, sign out and send to login
  if (!profile) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  const showOnboarding = !(profile as Profile).onboarding_complete

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <Navbar profile={profile as Profile} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      {showOnboarding && <OnboardingTour userId={user.id} />}
    </div>
  )
}
