import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MatchImport from '@/components/admin/MatchImport'

export default async function MatchImportPage() {
  const supabase = await createClient()

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_active', true)
    .single()

  if (!season) redirect('/admin/matches')

  // Current match count so the client can auto-number from here
  const { count } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', season.id)

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-[#0b0b0b]">Import Matches</h2>
        <p className="text-muted-foreground mt-0.5">
          {season.name} — upload an Excel file to bulk-add fixtures
        </p>
      </div>
      <MatchImport seasonId={season.id} currentMatchCount={count ?? 0} />
    </div>
  )
}
