import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import StatsForm from '@/components/admin/StatsForm'
import PlayingXIForm from '@/components/admin/PlayingXIForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

  const { data: playingXIRows } = await supabase
    .from('match_playing_xi')
    .select('player_id')
    .eq('match_id', id)

  const existingXI = (playingXIRows ?? []).map((r: { player_id: string }) => r.player_id)

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
        <h2 className="text-2xl font-bold text-[#ebebeb]">
          Match {match.match_number} — {match.opponent}
        </h2>
        <p className="text-muted-foreground">
          {new Date(match.match_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {(!players || players.length === 0) ? (
        <p className="text-muted-foreground">No players found for this season.</p>
      ) : (
        <div className="space-y-6">
          {/* Playing XI */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-[#C9A84C] flex items-center gap-2">
                🟢 Playing XI
                <span className="text-xs font-normal text-muted-foreground">
                  — Confirm who is playing so members can see before they pick their team
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PlayingXIForm
                matchId={id}
                players={players as Player[]}
                existingXI={existingXI}
              />
            </CardContent>
          </Card>

          {/* Stats entry */}
          <StatsForm
            matchId={id}
            players={players as Player[]}
            existingPerfs={perfByPlayer}
            matchStatus={match.status}
          />
        </div>
      )}
    </div>
  )
}
