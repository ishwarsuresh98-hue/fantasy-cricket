import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * /dashboard — redirects to the first club's dashboard.
 * All season data now lives under /clubs/[slug]/dashboard.
 */
export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: club } = await supabase
    .from('clubs')
    .select('slug')
    .order('name')
    .limit(1)
    .single()

  redirect(club?.slug ? `/clubs/${club.slug}/dashboard` : '/')
}
