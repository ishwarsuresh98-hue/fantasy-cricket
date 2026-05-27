import { createClient }         from '@/lib/supabase/server'
import { getClubBySlug }        from '@/lib/club'
import { notFound, redirect }   from 'next/navigation'
import ContestTemplatesAdmin    from '@/components/admin/ContestTemplatesAdmin'
import type { ContestTemplate } from '@/types'

export default async function ContestTemplatesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()

  // ── Admin guard ────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile }  = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()
  if (profile?.role !== 'admin') redirect(`/clubs/${slug}/dashboard`)

  // ── Templates ──────────────────────────────────────────────────────────────
  const { data: templates } = await supabase
    .from('contest_templates')
    .select('*')
    .eq('club_id', club.id)
    .order('entry_fee', { ascending: true })

  // ── Upcoming matches ───────────────────────────────────────────────────────
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('club_id', club.id)
    .eq('is_active', true)
    .single()

  const { data: matches } = season
    ? await supabase
        .from('matches')
        .select('id, match_number, opponent, match_date')
        .eq('season_id', season.id)
        .eq('status', 'upcoming')
        .order('match_date', { ascending: true })
    : { data: [] }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Contest Templates</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Configure default contest types and generate them per match.
        </p>
      </div>

      {!templates || templates.length === 0 ? (
        <div className="rounded-2xl bg-gray-50 border border-gray-200 py-16 text-center">
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-gray-500 font-medium">No contest templates yet.</p>
          <p className="text-gray-400 text-sm mt-1">
            Run the SQL migration to seed 8 default templates for this club.
          </p>
        </div>
      ) : (
        <ContestTemplatesAdmin
          templates={templates as ContestTemplate[]}
          matches={matches ?? []}
          clubSlug={slug}
        />
      )}
    </div>
  )
}
