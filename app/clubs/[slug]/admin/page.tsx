import { createClient } from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import CreateSeasonForm from '@/components/admin/CreateSeasonForm'
import RecalculatePointsButton from '@/components/admin/RecalculatePointsButton'

export default async function ClubAdminPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()
  const base = `/clubs/${slug}/admin`

  const [{ data: season }] = await Promise.all([
    supabase.from('seasons').select('*').eq('is_active', true).eq('club_id', club.id).single(),
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
      <h1 className="text-2xl font-bold text-[#262162]">Admin Panel — {club.name}</h1>

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
            <p className="text-muted-foreground mb-4">No active season for {club.name}.</p>
            <CreateSeasonForm clubId={club.id} />
          </CardContent>
        </Card>
      )}

      {season && (
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { href: `${base}/players`, label: 'Manage Players', icon: '👤', desc: 'Add, edit, set credits' },
            { href: `${base}/matches`, label: 'Manage Matches',  icon: '📅', desc: 'Schedule, enter stats' },
            { href: `${base}/boosters`, label: 'Boosters',       icon: '⚡', desc: 'View booster usage' },
            { href: `${base}/transfers`, label: 'Transfers',     icon: '🔄', desc: 'Review transfer logs' },
            { href: `${base}/contests`, label: 'Contests',       icon: '🏆', desc: 'Create & manage contests' },
          ].map(({ href, label, icon, desc }) => (
            <Link key={href} href={href} className={cn(buttonVariants({ variant: 'outline' }), 'h-auto flex flex-col items-start gap-1 px-5 py-4 text-left')}>
              <div className="flex items-center gap-2 font-semibold">
                <span>{icon}</span>
                <span>{label}</span>
              </div>
              <p className="text-xs text-muted-foreground font-normal">{desc}</p>
            </Link>
          ))}
        </div>
      )}

      {season && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <p className="text-sm font-bold text-[#262162]">Utilities</p>
          <RecalculatePointsButton />
        </div>
      )}
    </div>
  )
}
