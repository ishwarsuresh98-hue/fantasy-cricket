import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import StatsForm from '@/components/admin/StatsForm'
import type { Player, MatchPerformance } from '@/types'

export default async function StatsEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: match } = await supabase
    .from('matches')
    .select('*, seasons(*)')
    .eq('id', id)
    .single()

  if (!match) notFound()

  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('season_id', match.season_id)
    .eq('is_active', true)
    .order('name')

  const { data: existingPerfs } = await supabase
    .from('match_performances')
    .select('*')
    .eq('match_id', id)

  const perfByPlayer: Record<string, MatchPerformance> = {}
  for (const p of existingPerfs ?? []) {
    perfByPlayer[p.player_id] = p
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/admin/matches" className="hover:underline">Matches</Link>
          <span>/</span>
          <span>Match {match.match_number} Stats</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">
          Match {match.match_number} vs {match.opponent}
        </h2>
        <p className="text-muted-foreground">
          {new Date(match.match_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {(!players || players.length === 0) ? (
        <p className="text-muted-foreground">No players found for this season.</p>
      ) : (
        <StatsForm
          matchId={id}
          players={players as Player[]}
          existingPerfs={perfByPlayer}
          matchStatus={match.status}
        />
      )}
    </div>
  )
}
