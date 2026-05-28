import { createClient }  from '@/lib/supabase/server'
import { getClubBySlug } from '@/lib/club'
import { notFound }      from 'next/navigation'
import SyncPanel         from '@/components/admin/SyncPanel'

export default async function ClubAdminSyncPage({
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
    .select('id, name, start_date')
    .eq('is_active', true)
    .eq('club_id', club.id)
    .single()

  const seasonYear = season?.start_date
    ? new Date(season.start_date).getFullYear().toString()
    : new Date().getFullYear().toString()

  // ── Matches: all club seasons, date window −30d → +60d ──────────────────
  // Don't restrict to the active season — manually-imported matches from any
  // season and matches whose season link is missing should still appear.
  const { data: allSeasons } = await supabase
    .from('seasons')
    .select('id')
    .eq('club_id', club.id)

  const seasonIds = (allSeasons ?? []).map(s => s.id)

  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - 30)
  const windowEnd = new Date()
  windowEnd.setDate(windowEnd.getDate() + 60)

  const { data: matches } = seasonIds.length > 0
    ? await supabase
        .from('matches')
        .select('id, match_number, opponent, match_date, play_cricket_id')
        .in('season_id', seasonIds)
        .gte('match_date', windowStart.toISOString().split('T')[0])
        .lte('match_date', windowEnd.toISOString().split('T')[0])
        .order('match_date', { ascending: false })
    : { data: [] }

  const hasSiteId = Boolean(process.env.PLAY_CRICKET_SITE_ID)
  const hasApiKey = Boolean(process.env.PLAY_CRICKET_API_KEY)

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-[#C9A84C]">Play Cricket Sync</h2>
        <p className="text-gray-500 text-sm mt-0.5">
          {season ? season.name : 'No active season'} · Import matches, squad lists, and results from Play Cricket
        </p>
      </div>

      {/* Env var status */}
      <div className="rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className={hasApiKey ? 'text-green-600' : 'text-red-500'}>{hasApiKey ? '✓' : '✗'}</span>
          <span className="text-gray-600 font-semibold">PLAY_CRICKET_API_KEY</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={hasSiteId ? 'text-green-600' : 'text-red-500'}>{hasSiteId ? '✓' : '✗'}</span>
          <span className="text-gray-600 font-semibold">PLAY_CRICKET_SITE_ID</span>
        </div>
        {(!hasApiKey || !hasSiteId) && (
          <span className="text-amber-600 font-medium ml-auto">
            Add missing env vars in Vercel → Settings → Environment Variables, then redeploy.
          </span>
        )}
      </div>

      {!season ? (
        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Create an active season before syncing.</p>
        </div>
      ) : (
        <SyncPanel
          seasonId={season.id}
          seasonYear={seasonYear}
          matches={(matches ?? []) as {
            id: string; match_number: number; opponent: string; match_date: string; play_cricket_id: string | null
          }[]}
        />
      )}
    </div>
  )
}
