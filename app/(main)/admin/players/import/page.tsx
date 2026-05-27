import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PlayerImport from '@/components/admin/PlayerImport'

export default async function PlayerImportPage() {
  const supabase = await createClient()

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_active', true)
    .single()

  if (!season) redirect('/admin/players')

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-[#0b0b0b]">Import Players</h2>
        <p className="text-muted-foreground mt-0.5">{season.name} — upload an Excel file to bulk-add players</p>
      </div>
      <PlayerImport seasonId={season.id} />
    </div>
  )
}
