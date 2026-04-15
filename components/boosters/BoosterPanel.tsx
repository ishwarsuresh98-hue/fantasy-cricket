'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BOOSTERS } from '@/lib/boosters'
import type { TeamBooster, FantasySelection, Player } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'

interface BoosterPanelProps {
  fantasyTeamId: string
  matchId: string
  matchStatus: 'upcoming' | 'completed'
  boosterUsage: TeamBooster[]          // all boosters used by this team this season
  currentSelections: FantasySelection[] // selections for nextMatch
  players: Player[]
  deadlinePassed?: boolean
}

export default function BoosterPanel({
  fantasyTeamId,
  matchId,
  matchStatus,
  boosterUsage,
  currentSelections,
  players,
  deadlinePassed = false,
}: BoosterPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Which booster is active for THIS match?
  const activeBooster = boosterUsage.find((b) => b.match_id === matchId)

  // How many times has each booster type been used this season?
  function usesLeft(type: string, maxUses: number) {
    const used = boosterUsage.filter((b) => b.booster_type === type).length
    return Math.max(0, maxUses - used)
  }

  async function activateBooster(type: string, selectedPlayerId?: string) {
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('team_boosters').insert({
      fantasy_team_id: fantasyTeamId,
      match_id: matchId,
      booster_type: type,
      selected_player_id: selectedPlayerId ?? null,
    })
    if (err) {
      setError(err.message)
      return false
    }
    return true
  }

  async function activateFreeHit() {
    setError(null)
    const supabase = createClient()

    // Save current squad as snapshot before user picks new Free Hit squad
    const snapshot = currentSelections.map((s) => ({
      player_id: s.player_id,
      is_captain: s.is_captain,
      is_vice_captain: s.is_vice_captain,
    }))

    await supabase.from('free_hit_snapshots').upsert({
      fantasy_team_id: fantasyTeamId,
      match_id: matchId,
      snapshot,
    })

    const ok = await activateBooster('free_hit')
    if (ok) {
      startTransition(() => router.refresh())
    }
  }

  if (matchStatus === 'completed') return null

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-[#262162]">Boosters</h2>
        <p className="text-sm text-muted-foreground">
          One booster per match. Activate before the match starts.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {BOOSTERS.map((booster) => {
          const remaining = usesLeft(booster.type, booster.maxUses)
          const isActiveThisMatch = activeBooster?.booster_type === booster.type
          const isExhausted = remaining === 0
          const canActivate =
            matchStatus === 'upcoming' &&
            !activeBooster &&
            !isExhausted &&
            !deadlinePassed

          return (
            <div
              key={booster.type}
              className={`relative flex flex-col gap-2 rounded-xl border p-3 transition-all ${
                isActiveThisMatch
                  ? 'border-[#fbf927] bg-[#fefde8] shadow-md'
                  : isExhausted
                  ? 'border-gray-200 bg-gray-50 opacity-60'
                  : 'border-gray-200 bg-white hover:border-[#262162]/30 hover:shadow-sm'
              }`}
            >
              <div className="text-2xl text-center">{booster.icon}</div>
              <div className="flex-1 space-y-1 text-center">
                <p className="text-xs font-semibold text-[#262162] leading-tight">{booster.name}</p>
                <p className="text-[11px] text-muted-foreground leading-tight">{booster.description}</p>
              </div>

              {isActiveThisMatch ? (
                <Badge className="bg-[#fbf927] text-[#262162] hover:bg-[#fbf927] text-[11px] justify-center font-bold">
                  Active ✓
                </Badge>
              ) : isExhausted ? (
                <Badge variant="secondary" className="text-[11px] justify-center">
                  Used
                </Badge>
              ) : (
                <Badge className="bg-[#eeedf8] text-[#262162] hover:bg-[#eeedf8] text-[11px] justify-center">
                  {remaining}/{booster.maxUses} left
                </Badge>
              )}

              {canActivate && (
                <>
                  {booster.type === 'triple_captain' ? (
                    <TripleCaptainDialog
                      fantasyTeamId={fantasyTeamId}
                      matchId={matchId}
                      players={players}
                      currentSelections={currentSelections}
                      isPending={isPending}
                      onActivate={async (playerId) => {
                        const ok = await activateBooster('triple_captain', playerId)
                        if (ok) startTransition(() => router.refresh())
                      }}
                    />
                  ) : booster.type === 'free_hit' ? (
                    <FreeHitDialog
                      isPending={isPending}
                      onActivate={activateFreeHit}
                    />
                  ) : (
                    <SimpleBoosterDialog
                      booster={booster}
                      isPending={isPending}
                      onActivate={async () => {
                        const ok = await activateBooster(booster.type)
                        if (ok) startTransition(() => router.refresh())
                      }}
                    />
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Simple confirmation dialog ─────────────────────────────
function SimpleBoosterDialog({
  booster,
  isPending,
  onActivate,
}: {
  booster: { name: string; icon: string; description: string }
  isPending: boolean
  onActivate: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleActivate() {
    setLoading(true)
    await onActivate()
    setLoading(false)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            disabled={isPending}
            className="w-full py-1 rounded-lg text-xs font-semibold bg-[#262162] text-white hover:bg-[#1a1748] transition-colors disabled:opacity-50"
          />
        }
      >
        Activate
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {booster.icon} Activate {booster.name}?
          </DialogTitle>
          <DialogDescription>{booster.description}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This uses one of your {booster.name} activations. You cannot change your booster after activating.
        </p>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            onClick={handleActivate}
            disabled={loading}
            className="bg-[#262162] hover:bg-[#1a1748]"
          >
            {loading ? 'Activating…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Free Hit warning dialog ───────────────────────────────
function FreeHitDialog({
  isPending,
  onActivate,
}: {
  isPending: boolean
  onActivate: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleActivate() {
    setLoading(true)
    await onActivate()
    setLoading(false)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            disabled={isPending}
            className="w-full py-1 rounded-lg text-xs font-semibold bg-[#262162] text-white hover:bg-[#1a1748] transition-colors disabled:opacity-50"
          />
        }
      >
        Activate
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🆓 Activate Free Hit?</DialogTitle>
          <DialogDescription>
            For this match only, your budget cap is removed — pick any 11 players!
          </DialogDescription>
        </DialogHeader>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-3 py-2">
          ⚠️ <strong>Note:</strong> Your squad will revert to its pre-Free Hit state for the next match.
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            onClick={handleActivate}
            disabled={loading}
            className="bg-[#262162] hover:bg-[#1a1748]"
          >
            {loading ? 'Activating…' : 'Activate Free Hit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Triple Captain player picker dialog ───────────────────
function TripleCaptainDialog({
  fantasyTeamId,
  matchId,
  players,
  currentSelections,
  isPending,
  onActivate,
}: {
  fantasyTeamId: string
  matchId: string
  players: Player[]
  currentSelections: FantasySelection[]
  isPending: boolean
  onActivate: (playerId: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Only show players currently in the squad
  const squadIds = new Set(currentSelections.map((s) => s.player_id))
  const squadPlayers = players.filter((p) => squadIds.has(p.id))

  async function handleActivate() {
    if (!chosenId) return
    setLoading(true)
    await onActivate(chosenId)
    setLoading(false)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            disabled={isPending || currentSelections.length === 0}
            className="w-full py-1 rounded-lg text-xs font-semibold bg-[#262162] text-white hover:bg-[#1a1748] transition-colors disabled:opacity-50"
          />
        }
      >
        Activate
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>👑 Triple Captain</DialogTitle>
          <DialogDescription>
            Choose one player from your squad to earn 3× points this match.
          </DialogDescription>
        </DialogHeader>
        {squadPlayers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Select your squad first before activating Triple Captain.
          </p>
        ) : (
          <div className="max-h-60 overflow-y-auto divide-y rounded-lg border">
            {squadPlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => setChosenId(p.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors ${
                  chosenId === p.id
                    ? 'bg-[#eeedf8] text-[#262162]'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{p.role.replace('_', ' ')}</p>
                </div>
                {chosenId === p.id && (
                  <span className="text-[#262162] font-bold text-sm">✓</span>
                )}
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            onClick={handleActivate}
            disabled={!chosenId || loading}
            className="bg-[#262162] hover:bg-[#1a1748]"
          >
            {loading ? 'Activating…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
