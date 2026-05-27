import { createClient } from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import { notFound, redirect } from 'next/navigation'
import PlayerImport from '@/components/admin/PlayerImport'

export default async function ClubAdminPlayerImportPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_active', true)
    .eq('club_id', club.id)
    .single()

  if (!season) redirect(`/clubs/${slug}/admin/players`)

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Import Players</h2>
        <p className="text-muted-foreground mt-0.5">{season.name} — upload an Excel file to bulk-add players</p>
      </div>
      <PlayerImport seasonId={season.id} />
    </div>
  )
}
