import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/nav/Navbar'
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

  // Profile missing (DB trigger didn't fire on signup) — create it now
  if (!profile) {
    const displayName =
      user.user_metadata?.display_name ??
      user.email?.split('@')[0] ??
      'User'
    await supabase
      .from('profiles')
      .insert({ id: user.id, display_name: displayName })
    const { data: created } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    profile = created
  }

  if (!profile) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar profile={profile as Profile} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
