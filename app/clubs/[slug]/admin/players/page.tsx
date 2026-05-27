import { createClient } from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Player } from '@/types'
import PlayerForm from '@/components/admin/PlayerForm'
import PlayerGrid from '@/components/admin/PlayerGrid'

export default async function ClubAdminPlayersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()
  const base = `/clubs/${slug}/admin`

  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .eq('club_id', club.id)
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-[#ebebeb]">Players</h2>
          <p className="text-muted-foreground">{season.name} • {allPlayers.length} players</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`${base}/players/import`}
            className={cn(buttonVariants({ variant: 'outline' }), 'border-[#C9A84C] text-[#C9A84C] hover:bg-[#1c1c1c]')}
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
