'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Player } from '@/types'
import { PLAYER_ROLE_LABELS } from '@/lib/scoring'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface PlayerFormProps {
  seasonId: string
  player?: Player
}

export default function PlayerForm({ seasonId, player }: PlayerFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(player?.name ?? '')
  const [role, setRole] = useState(player?.role ?? 'batsman')
  const [price, setPrice] = useState(String(player?.price ?? ''))
  const [isActive, setIsActive] = useState(player?.is_active ?? true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const payload = {
      name: name.trim(),
      role,
      price: parseInt(price),
      is_active: isActive,
      season_id: seasonId,
    }

    if (player) {
      const { error: err } = await supabase.from('players').update(payload).eq('id', player.id)
      if (err) { setError(err.message); setLoading(false); return }
    } else {
      const { error: err } = await supabase.from('players').insert(payload)
      if (err) { setError(err.message); setLoading(false); return }
    }

    setOpen(false)
    router.refresh()
    setLoading(false)
    if (!player) {
      setName('')
      setRole('batsman')
      setPrice('')
    }
  }

  async function handleDelete() {
    if (!player) return
    if (!confirm(`Delete ${player.name}? This cannot be undone.`)) return
    const supabase = createClient()
    await supabase.from('players').delete().eq('id', player.id)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex gap-2">
        <DialogTrigger
          render={
            <button className={cn(buttonVariants({ variant: player ? 'ghost' : 'default', size: 'sm' }))} />
          }
        >
          {player ? 'Edit' : 'Add Player'}
        </DialogTrigger>
        {player && (
          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={handleDelete}>
            Delete
          </Button>
        )}
      </div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{player ? 'Edit Player' : 'Add Player'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">{error}</div>
          )}
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => { if (v) setRole(v as typeof role) }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLAYER_ROLE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Price (credits)</Label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 10"
                min={1}
                required
              />
            </div>
          </div>
          {player && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="isActive" className="cursor-pointer">Active (available for selection)</Label>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
