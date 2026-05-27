import { createClient } from '@/lib/supabase/server'
import type { Club } from '@/types'

/**
 * Fetch a club by its URL slug.
 * Returns null if not found.
 */
export async function getClubBySlug(slug: string): Promise<Club | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('clubs')
    .select('id, name, slug, logo_url, location, primary_color, created_at')
    .eq('slug', slug)
    .single()
  return data ?? null
}
