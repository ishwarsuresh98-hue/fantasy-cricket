import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PlayingXIPicker from '@/components/admin/PlayingXIPicker'
import type { Player } from '@/types'

export default async function PlayingXIPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: xiRows } = await supabase
    .from('match_playing_xi')
    .select('player_id')
    .eq('match_id', id)

  const existingXI = (xiRows ?? []).map((r: { player_id: string }) => r.player_id)

  const matchDate = new Date(match.match_date).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/matches" className="hover:underline hover:text-[#C9A84C]">Matches</Link>
        <span>/</span>
        <span>Match {match.match_number} — {match.opponent}</span>
        <span>/</span>
        <span className="font-medium text-[#C9A84C]">Playing XI</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#ebebeb]">Set Playing XI</h2>
          <p className="text-muted-foreground mt-0.5">
            Match {match.match_number} — {match.opponent} &bull; {matchDate}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Select exactly 11 players who will play in this match.
            Members will see a <span className="font-semibold text-green-700">Playing</span> badge on confirmed players
            when picking their fantasy team.
          </p>
        </div>
        <Link
          href={`/admin/matches/${id}/stats`}
          className="text-sm text-[#C9A84C] hover:underline shrink-0"
        >
          → Stats entry
        </Link>
      </div>

      {(!players || players.length === 0) ? (
        <p className="text-muted-foreground">No players found for this season.</p>
      ) : (
        <PlayingXIPicker
          matchId={id}
          matchLabel={`Match ${match.match_number} — ${match.opponent}`}
          players={players as Player[]}
          existingXI={existingXI}
        />
      )}
    </div>
  )
}
