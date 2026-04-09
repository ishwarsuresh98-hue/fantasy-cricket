import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PLAYER_ROLE_LABELS } from '@/lib/scoring'
import type { Player } from '@/types'
import PlayerForm from '@/components/admin/PlayerForm'

const ROLE_COLORS: Record<string, string> = {
  batsman: 'bg-blue-100 text-blue-700',
  bowler: 'bg-red-100 text-red-700',
  all_rounder: 'bg-purple-100 text-purple-700',
  wicket_keeper: 'bg-orange-100 text-orange-700',
}

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
    .order('role')
    .order('name')

  const grouped = (players ?? []).reduce((acc: Record<string, Player[]>, p: Player) => {
    if (!acc[p.role]) acc[p.role] = []
    acc[p.role].push(p)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Players</h2>
          <p className="text-muted-foreground">{season.name} • {players?.length ?? 0} players</p>
        </div>
        <PlayerForm seasonId={season.id} />
      </div>

      {(!players || players.length === 0) ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-3">👤</div>
            <p className="text-muted-foreground">No players added yet. Add club members who will play this season.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(PLAYER_ROLE_LABELS).map(([role, label]) => {
          const rolePlayers = grouped[role] ?? []
          if (rolePlayers.length === 0) return null
          return (
            <Card key={role}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge className={`${ROLE_COLORS[role]} hover:${ROLE_COLORS[role]}`}>{label}</Badge>
                  <span className="text-muted-foreground font-normal">({rolePlayers.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {rolePlayers.map((player: Player) => (
                    <div key={player.id} className="flex items-center justify-between px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-medium">{player.name}</p>
                          <p className="text-xs text-muted-foreground">Price: {player.price} credits</p>
                        </div>
                        {!player.is_active && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                        )}
                      </div>
                      <PlayerForm seasonId={season.id} player={player} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
