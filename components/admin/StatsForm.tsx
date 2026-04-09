'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Player, MatchPerformance } from '@/types'
import { PLAYER_ROLE_LABELS, computeBasePoints } from '@/lib/scoring'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface PlayerStats {
  runs: number
  balls: number
  fours: number
  sixes: number
  dnb: boolean
  wickets: number
  catches: number
  stumpings: number
  runOuts: number
}

interface StatsFormProps {
  matchId: string
  players: Player[]
  existingPerfs: Record<string, MatchPerformance>
  matchStatus: string
}

function defaultStats(perf?: MatchPerformance): PlayerStats {
  if (!perf) return { runs: 0, balls: 0, fours: 0, sixes: 0, dnb: false, wickets: 0, catches: 0, stumpings: 0, runOuts: 0 }
  return {
    runs: perf.runs_scored,
    balls: perf.balls_faced,
    fours: perf.fours,
    sixes: perf.sixes,
    dnb: perf.did_not_bat,
    wickets: perf.wickets,
    catches: perf.catches,
    stumpings: perf.stumpings,
    runOuts: perf.run_outs,
  }
}

const NUM = (v: string) => Math.max(0, parseInt(v) || 0)

export default function StatsForm({ matchId, players, existingPerfs, matchStatus }: StatsFormProps) {
  const router = useRouter()
  const [stats, setStats] = useState<Record<string, PlayerStats>>(
    () => Object.fromEntries(players.map((p) => [p.id, defaultStats(existingPerfs[p.id])]))
  )
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  function update(playerId: string, field: keyof PlayerStats, value: string | boolean) {
    setStats((prev) => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        [field]: typeof value === 'boolean' ? value : NUM(value as string),
      },
    }))
  }

  function previewPoints(s: PlayerStats) {
    return computeBasePoints({
      runs_scored: s.runs, balls_faced: s.balls, fours: s.fours, sixes: s.sixes,
      did_not_bat: s.dnb, wickets: s.wickets, catches: s.catches, stumpings: s.stumpings, run_outs: s.runOuts,
    })
  }

  async function handleSave() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const rows = players.map((p) => {
      const s = stats[p.id]
      return {
        match_id: matchId,
        player_id: p.id,
        runs_scored: s.dnb ? 0 : s.runs,
        balls_faced: s.dnb ? 0 : s.balls,
        fours: s.dnb ? 0 : s.fours,
        sixes: s.dnb ? 0 : s.sixes,
        did_not_bat: s.dnb,
        wickets: s.wickets,
        catches: s.catches,
        stumpings: s.stumpings,
        run_outs: s.runOuts,
      }
    })

    const { error: err } = await supabase
      .from('match_performances')
      .upsert(rows, { onConflict: 'match_id,player_id' })

    if (err) { setError(err.message); setLoading(false); return }

    // Mark match as completed
    await supabase.from('matches').update({
      status: 'completed',
      result: result.trim() || null,
    }).eq('id', matchId)

    setSavedMessage('Stats saved and points calculated!')
    setTimeout(() => setSavedMessage(null), 4000)
    router.refresh()
    setLoading(false)
  }

  const totalPoints = players.reduce((sum, p) => sum + previewPoints(stats[p.id]), 0)

  return (
    <div className="space-y-6">
      {/* Match result */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Match Result</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder='e.g. "Won by 45 runs" or "Lost by 3 wickets"'
            defaultValue={existingPerfs[Object.keys(existingPerfs)[0]] ? '' : ''}
          />
          <p className="text-xs text-muted-foreground mt-1">Optional — shown on match detail page</p>
        </CardContent>
      </Card>

      {/* Stats table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Player Statistics</CardTitle>
            <span className="text-sm text-muted-foreground">Preview total: {totalPoints} pts</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3 min-w-[140px]">Player</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">DNB</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">Runs</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">Balls</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">4s</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">6s</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">Wkts</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">Ct</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">St</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">RO</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase px-4 py-3">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {players.map((player) => {
                  const s = stats[player.id]
                  const pts = previewPoints(s)
                  return (
                    <tr key={player.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <p className="text-sm font-medium">{player.name}</p>
                        <Badge className={`text-xs mt-0.5 ${
                          player.role === 'batsman' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' :
                          player.role === 'bowler' ? 'bg-red-100 text-red-700 hover:bg-red-100' :
                          player.role === 'all_rounder' ? 'bg-purple-100 text-purple-700 hover:bg-purple-100' :
                          'bg-orange-100 text-orange-700 hover:bg-orange-100'
                        }`}>
                          {PLAYER_ROLE_LABELS[player.role]}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={s.dnb}
                          onChange={(e) => update(player.id, 'dnb', e.target.checked)}
                          className="rounded"
                        />
                      </td>
                      {(['runs','balls','fours','sixes'] as const).map((field) => (
                        <td key={field} className="px-2 py-2">
                          <Input
                            type="number"
                            value={s.dnb ? '' : s[field]}
                            onChange={(e) => update(player.id, field, e.target.value)}
                            disabled={s.dnb}
                            className="w-16 text-center p-1 h-8 text-sm"
                            min={0}
                          />
                        </td>
                      ))}
                      {(['wickets','catches','stumpings','runOuts'] as const).map((field) => (
                        <td key={field} className="px-2 py-2">
                          <Input
                            type="number"
                            value={s[field]}
                            onChange={(e) => update(player.id, field, e.target.value)}
                            className="w-16 text-center p-1 h-8 text-sm"
                            min={0}
                          />
                        </td>
                      ))}
                      <td className="px-4 py-2 text-right font-bold text-emerald-700">{pts}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">{error}</div>
      )}
      {savedMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2 rounded-md">{savedMessage}</div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Saving will mark this match as completed and calculate all fantasy points.
        </p>
        <Button onClick={handleSave} disabled={loading} size="lg">
          {loading ? 'Saving...' : 'Save Stats & Calculate Points'}
        </Button>
      </div>
    </div>
  )
}
