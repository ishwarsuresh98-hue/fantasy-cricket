'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Season, Match, Player, FantasyTeam, FantasySelection } from '@/types'
import { PLAYER_ROLE_LABELS } from '@/lib/scoring'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TeamBuilderProps {
  season: Season
  nextMatch: Match
  players: Player[]
  myTeam: FantasyTeam | null
  existingSelections: FantasySelection[]
  userId: string
  freeHitActive?: boolean
  deadlinePassed?: boolean
  creditTrends?: Record<string, 'up' | 'down' | 'neutral'>
}

const ROLE_COLORS: Record<string, string> = {
  batsman: 'bg-blue-100 text-blue-700',
  bowler: 'bg-[#fceaea] text-[#b5211e]',
  all_rounder: 'bg-[#eeedf8] text-[#262162]',
  wicket_keeper: 'bg-[#fefde8] text-[#262162]',
}

const ROLE_CONSTRAINTS: Record<string, { min: number; max: number; label: string }> = {
  wicket_keeper: { min: 1, max: 4, label: 'Wicket Keepers' },
  batsman:       { min: 3, max: 6, label: 'Batsmen' },
  all_rounder:   { min: 1, max: 4, label: 'All-Rounders' },
  bowler:        { min: 3, max: 6, label: 'Bowlers' },
}

const SHORT_LABELS: Record<string, string> = {
  wicket_keeper: 'WK',
  batsman: 'BAT',
  all_rounder: 'AR',
  bowler: 'BOWL',
}

const ROLE_ORDER = ['wicket_keeper', 'batsman', 'all_rounder', 'bowler']

export default function TeamBuilder({ season, nextMatch, players, myTeam, existingSelections, userId, freeHitActive = false, deadlinePassed = false, creditTrends = {} }: TeamBuilderProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [teamName, setTeamName] = useState(myTeam?.team_name ?? '')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(existingSelections.map((s) => s.player_id))
  )
  const [captainId, setCaptainId] = useState<string | null>(
    existingSelections.find((s) => s.is_captain)?.player_id ?? null
  )
  const [vcId, setVcId] = useState<string | null>(
    existingSelections.find((s) => s.is_vice_captain)?.player_id ?? null
  )
  const [roleFilter, setRoleFilter] = useState<string>('wicket_keeper')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const maxPlayers = season.players_per_team
  const budget = season.team_budget

  const selectedPlayers = players.filter((p) => selectedIds.has(p.id))
  const budgetUsed = selectedPlayers.reduce((sum, p) => sum + p.price, 0)
  const budgetRemaining = budget - budgetUsed

  const filteredPlayers = players.filter((p) => {
    if (p.role !== roleFilter) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function togglePlayer(player: Player) {
    if (deadlinePassed) return
    const newSet = new Set(selectedIds)
    if (newSet.has(player.id)) {
      newSet.delete(player.id)
      if (captainId === player.id) setCaptainId(null)
      if (vcId === player.id) setVcId(null)
    } else {
      if (newSet.size >= maxPlayers) return
      // Skip budget check when Free Hit is active
      if (!freeHitActive && budgetUsed + player.price > budget) return
      // Enforce role maximum
      const roleCount = selectedPlayers.filter((p) => p.role === player.role).length
      if (roleCount >= ROLE_CONSTRAINTS[player.role].max) return
      newSet.add(player.id)
    }
    setSelectedIds(newSet)
  }

  function setCaptain(playerId: string) {
    if (!selectedIds.has(playerId)) return
    if (captainId === playerId) { setCaptainId(null); return }
    if (vcId === playerId) setVcId(null)
    setCaptainId(playerId)
  }

  function setVC(playerId: string) {
    if (!selectedIds.has(playerId)) return
    if (vcId === playerId) { setVcId(null); return }
    if (captainId === playerId) setCaptainId(null)
    setVcId(playerId)
  }

  async function handleSave() {
    setError(null)
    if (deadlinePassed) { setError('The deadline has passed. Team selection is locked.'); return }
    if (!teamName.trim()) { setError('Please enter a team name.'); return }
    if (selectedIds.size !== maxPlayers) { setError(`Select exactly ${maxPlayers} players.`); return }
    // Validate role minimums
    for (const [role, { min, label }] of Object.entries(ROLE_CONSTRAINTS)) {
      const count = Array.from(selectedIds).filter((id) => players.find((p) => p.id === id)?.role === role).length
      if (count < min) { setError(`Select at least ${min} ${label}.`); return }
    }
    if (!captainId) { setError('Select a captain.'); return }
    if (!vcId) { setError('Select a vice-captain.'); return }

    const supabase = createClient()

    // Create team if doesn't exist
    let teamId = myTeam?.id
    if (!teamId) {
      const { data: newTeam, error: teamErr } = await supabase
        .from('fantasy_teams')
        .insert({ user_id: userId, season_id: season.id, team_name: teamName.trim() })
        .select()
        .single()
      if (teamErr) { setError(teamErr.message); return }
      teamId = newTeam.id
    } else if (teamName.trim() !== myTeam?.team_name) {
      await supabase.from('fantasy_teams').update({ team_name: teamName.trim() }).eq('id', teamId)
    }

    // Delete existing selections for this match
    await supabase.from('fantasy_selections').delete().eq('fantasy_team_id', teamId).eq('match_id', nextMatch.id)

    // Insert new selections
    const insertData = Array.from(selectedIds).map((pid) => ({
      fantasy_team_id: teamId!,
      match_id: nextMatch.id,
      player_id: pid,
      is_captain: pid === captainId,
      is_vice_captain: pid === vcId,
    }))

    const { error: selErr } = await supabase.from('fantasy_selections').insert(insertData)
    if (selErr) { setError(selErr.message); return }

    setSuccess(true)
    startTransition(() => { router.refresh() })
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#262162]">My Team</h1>
        <p className="text-muted-foreground mt-1">
          Picking for Match {nextMatch.match_number} — {nextMatch.opponent} •{' '}
          {new Date(nextMatch.match_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>

      {deadlinePassed && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <span className="text-xl">🔒</span>
          <div>
            <p className="text-sm font-bold text-red-700">Deadline passed for this gameweek</p>
            <p className="text-xs text-red-600">Team selection is locked. Your saved squad will play.</p>
          </div>
        </div>
      )}

      {freeHitActive && !deadlinePassed && (
        <div className="flex items-center gap-2 bg-[#fefde8] border border-[#fbf927] rounded-lg px-4 py-3">
          <span className="text-xl">🆓</span>
          <div>
            <p className="text-sm font-semibold text-[#262162]">Free Hit Active — No Budget Limit!</p>
            <p className="text-xs text-muted-foreground">Pick any players this match. Your squad reverts next match.</p>
          </div>
        </div>
      )}

      {/* Team name */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="teamName">Team Name</Label>
              <Input
                id="teamName"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Thunder Strikers"
                maxLength={40}
              />
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Budget</p>
              <p className={`text-2xl font-bold ${budgetRemaining < 0 ? 'text-[#b5211e]' : 'text-[#262162]'}`}>
                {budgetRemaining} <span className="text-sm font-normal">remaining</span>
              </p>
              <p className="text-xs text-muted-foreground">{budgetUsed} / {budget} used</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Players</p>
              <p className={`text-2xl font-bold ${selectedIds.size === maxPlayers ? 'text-[#262162]' : 'text-gray-700'}`}>
                {selectedIds.size} / {maxPlayers}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Player pool */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Player Pool</CardTitle>
              <div className="flex gap-2 flex-wrap pt-1">
                {ROLE_ORDER.map((r) => {
                  const roleSelectedCount = selectedPlayers.filter((p) => p.role === r).length
                  return (
                    <button
                      key={r}
                      onClick={() => setRoleFilter(r)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        roleFilter === r ? 'bg-[#262162] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {SHORT_LABELS[r]} ({roleSelectedCount})
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                Pick {ROLE_CONSTRAINTS[roleFilter].min}–{ROLE_CONSTRAINTS[roleFilter].max} {ROLE_CONSTRAINTS[roleFilter].label}
              </p>
              <Input
                placeholder="Search players..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mt-2"
              />
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[480px] overflow-y-auto">
                {filteredPlayers.map((player) => {
                  const isSelected = selectedIds.has(player.id)
                  const isAffordable = freeHitActive || (!isSelected && budgetUsed + player.price <= budget)
                  const isFull = !isSelected && selectedIds.size >= maxPlayers
                  const disabled = (!isSelected && !isAffordable) || isFull

                  return (
                    <div
                      key={player.id}
                      onClick={() => !disabled && togglePlayer(player)}
                      className={`flex items-center justify-between px-4 py-3 transition-colors ${
                        isSelected ? 'bg-[#eeedf8]' : disabled ? 'opacity-50' : 'hover:bg-gray-50 cursor-pointer'
                      } ${!disabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isSelected ? 'bg-[#262162] border-[#262162]' : 'border-gray-300'
                        }`}>
                          {isSelected && <span className="text-white text-xs">✓</span>}
                        </div>
                        <div>
                          <div className="flex items-center gap-1">
                            <Link
                              href={`/players/${player.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-sm font-medium hover:underline hover:text-[#262162]"
                            >
                              {player.name}
                            </Link>
                          </div>
                          <Badge className={`text-xs ${ROLE_COLORS[player.role]} hover:${ROLE_COLORS[player.role]}`}>
                            {PLAYER_ROLE_LABELS[player.role]}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); setCaptain(player.id) }}
                              className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                                captainId === player.id
                                  ? 'bg-yellow-400 border-yellow-400 text-white'
                                  : 'border-gray-300 text-gray-500 hover:border-yellow-400 hover:text-yellow-600'
                              }`}
                            >C</button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setVC(player.id) }}
                              className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                                vcId === player.id
                                  ? 'bg-blue-400 border-blue-400 text-white'
                                  : 'border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600'
                              }`}
                            >VC</button>
                          </>
                        )}
                        <div className="flex items-center gap-0.5">
                          <span className="text-sm font-semibold text-[#262162] w-8 text-right">
                            {Number(player.price).toFixed(1)}
                          </span>
                          {creditTrends[player.id] === 'up'   && <span className="text-green-600 text-xs font-bold">↑</span>}
                          {creditTrends[player.id] === 'down' && <span className="text-red-500  text-xs font-bold">↓</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Selected team sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Selected XI</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {selectedPlayers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Click players to add them
                </p>
              ) : (
                <div className="divide-y">
                  {selectedPlayers.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{PLAYER_ROLE_LABELS[p.role]}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {captainId === p.id && (
                          <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 text-xs px-1.5">C</Badge>
                        )}
                        {vcId === p.id && (
                          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs px-1.5">VC</Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-1">{p.price}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-[#eeedf8] border border-[#262162]/20 text-[#262162] text-sm px-3 py-2 rounded-md">
              Team saved successfully!
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={isPending || deadlinePassed}
            className="w-full"
          >
            {deadlinePassed ? '🔒 Deadline Passed' : isPending ? 'Saving...' : myTeam ? 'Update Team' : 'Save Team'}
          </Button>
        </div>
      </div>
    </div>
  )
}
