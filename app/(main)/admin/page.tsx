import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import CreateSeasonForm from '@/components/admin/CreateSeasonForm'

export default async function AdminPage() {
  const supabase = await createClient()

  const [{ data: season }] = await Promise.all([
    supabase.from('seasons').select('*').eq('is_active', true).single(),
  ])

  const [{ count: playerCount }, { count: matchCount }, { count: teamCount }] = await Promise.all([
    season
      ? supabase.from('players').select('*', { count: 'exact', head: true }).eq('season_id', season.id)
      : Promise.resolve({ count: 0 }),
    season
      ? supabase.from('matches').select('*', { count: 'exact', head: true }).eq('season_id', season.id)
      : Promise.resolve({ count: 0 }),
    season
      ? supabase.from('fantasy_teams').select('*', { count: 'exact', head: true }).eq('season_id', season.id)
      : Promise.resolve({ count: 0 }),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#262162]">Admin Panel</h1>

      {season ? (
        <Card className="border-[#262162] border-2">
          <CardHeader className="bg-[#262162] rounded-t-xl pb-3">
            <CardTitle className="text-sm text-[#fbf927] font-semibold uppercase tracking-wide">Active Season</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-xl font-bold text-[#262162]">{season.name}</p>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="text-center p-3 bg-[#eeedf8] rounded-lg">
                <p className="text-2xl font-bold text-[#262162]">{playerCount ?? 0}</p>
                <p className="text-xs text-[#262162]/70 mt-0.5">Players</p>
              </div>
              <div className="text-center p-3 bg-[#eeedf8] rounded-lg">
                <p className="text-2xl font-bold text-[#262162]">{matchCount ?? 0}</p>
                <p className="text-xs text-[#262162]/70 mt-0.5">Matches</p>
              </div>
              <div className="text-center p-3 bg-[#eeedf8] rounded-lg">
                <p className="text-2xl font-bold text-[#262162]">{teamCount ?? 0}</p>
                <p className="text-xs text-[#262162]/70 mt-0.5">Fantasy Teams</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">No active season. Create one to get started.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="hover:border-[#262162] transition-colors">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-[#262162]">Players</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Add and manage club players available for selection.</p>
            <Link href="/admin/players" className={cn(buttonVariants({ size: 'sm' }), 'bg-[#262162] hover:bg-[#1a1748]')}>
              Manage Players
            </Link>
          </CardContent>
        </Card>
        <Card className="hover:border-[#262162] transition-colors">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-[#262162]">Matches</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Schedule matches and enter stats after each game.</p>
            <Link href="/admin/matches" className={cn(buttonVariants({ size: 'sm' }), 'bg-[#262162] hover:bg-[#1a1748]')}>
              Manage Matches
            </Link>
          </CardContent>
        </Card>
      </div>

      <CreateSeasonForm currentSeason={season} />
    </div>
  )
}
