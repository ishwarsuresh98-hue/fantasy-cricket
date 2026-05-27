import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RedirectPage() {
  const supabase = await createClient()
  const { data: club } = await supabase
    .from('clubs')
    .select('slug')
    .order('name')
    .limit(1)
    .single()
  redirect(club?.slug ? `/clubs/${club.slug}/team` : '/')
}
