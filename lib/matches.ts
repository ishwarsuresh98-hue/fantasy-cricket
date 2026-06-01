import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Renumber all matches in a season sequentially by date (ASC), then id (ASC).
 *
 * Uses a two-step approach to avoid unique-constraint conflicts on
 * (season_id, match_number):
 *   1. Shift every match_number up by 10 000 — puts all values in a range
 *      that no real match will occupy, so step 2 can assign 1, 2, 3… freely.
 *   2. Assign sequential numbers starting from 1 in chronological order.
 *
 * Each step issues one UPDATE per row — 2N round-trips for N matches.
 * For a typical cricket season (≤ 40 matches) this is fast enough inline.
 */
export async function renumberMatches(admin: AdminClient, seasonId: string): Promise<void> {
  const { data: matches } = await admin
    .from('matches')
    .select('id, match_number')
    .eq('season_id', seasonId)
    .order('match_date', { ascending: true })
    .order('id',         { ascending: true })

  if (!matches?.length) return

  // Step 1 — shift into a safe temporary range (10 001, 10 002, …)
  for (const m of matches) {
    await admin
      .from('matches')
      .update({ match_number: (m.match_number as number) + 10_000 })
      .eq('id', m.id as string)
  }

  // Step 2 — assign final sequential numbers (1, 2, 3, …)
  for (let i = 0; i < matches.length; i++) {
    await admin
      .from('matches')
      .update({ match_number: i + 1 })
      .eq('id', matches[i].id as string)
  }
}
