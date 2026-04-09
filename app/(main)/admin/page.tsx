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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
      </div>

      {season ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-800">Active Season</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-emerald-900">{season.name}</p>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-700">{playerCount ?? 0}</p>
                <p className="text-xs text-emerald-600">Players</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-700">{matchCount ?? 0}</p>
                <p className="text-xs text-emerald-600">Matches</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-700">{teamCount ?? 0}</p>
                <p className="text-xs text-emerald-600">Fantasy Teams</p>
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Players</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Add and manage club players available for selection.</p>
            <Link href="/admin/players" className={cn(buttonVariants({ size: 'sm' }))}>
              Manage Players
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Matches</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Schedule matches and enter stats after each game.</p>
            <Link href="/admin/matches" className={cn(buttonVariants({ size: 'sm' }))}>
              Manage Matches
            </Link>
          </CardContent>
        </Card>
      </div>

      <CreateSeasonForm currentSeason={season} />
    </div>
  )
}
