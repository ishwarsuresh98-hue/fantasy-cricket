import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Player } from '@/types'
import PlayerForm from '@/components/admin/PlayerForm'
import PlayerGrid from '@/components/admin/PlayerGrid'
import Link from 'next/link'

export default async function AdminPlayersPage() {
  const supabase = await createClient()

  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!season) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Create an active season first before adding players.</p>
      </div>
    )
  }

  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('season_id', season.id)
    .order('name')

  const allPlayers = (players ?? []) as Player[]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Players</h2>
          <p className="text-muted-foreground">{season.name} • {allPlayers.length} players</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/players/import"
            className={cn(buttonVariants({ variant: 'outline' }), 'border-[#262162] text-[#262162] hover:bg-[#eeedf8]')}
          >
            Import Players
          </Link>
          <PlayerForm seasonId={season.id} />
        </div>
      </div>

      {allPlayers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-3">👤</div>
            <p className="text-muted-foreground">No players added yet. Add club members who will play this season.</p>
          </CardContent>
        </Card>
      ) : (
        <PlayerGrid players={allPlayers} seasonId={season.id} />
      )}
    </div>
  )
}
