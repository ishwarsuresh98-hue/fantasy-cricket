'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Season } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface CreateSeasonFormProps {
  currentSeason?: Season | null
  clubId?: string
}

export default function CreateSeasonForm({ currentSeason, clubId }: CreateSeasonFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('100')
  const [playersPerTeam, setPlayersPerTeam] = useState('11')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()

    if (currentSeason) {
      await supabase.from('seasons').update({ is_active: false }).eq('id', currentSeason.id)
    }

    const { error: err } = await supabase.from('seasons').insert({
      name: name.trim(),
      team_budget: parseInt(budget),
      players_per_team: parseInt(playersPerTeam),
      start_date: startDate || null,
      end_date: endDate || null,
      is_active: true,
      ...(clubId ? { club_id: clubId } : {}),
    })

    if (err) {
      setError(err.message)
    } else {
      setOpen(false)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Season Management</CardTitle>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <button className={cn(buttonVariants({ variant: currentSeason ? 'outline' : 'default' }))} />
            }
          >
            {currentSeason ? 'Create New Season' : 'Create First Season'}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Season</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">{error}</div>
              )}
              <div className="space-y-1.5">
                <Label>Season Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Season 2026" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Team Budget (credits)</Label>
                  <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} min={1} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Players per Team</Label>
                  <Input type="number" value={playersPerTeam} onChange={(e) => setPlayersPerTeam(e.target.value)} min={1} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start Date (optional)</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date (optional)</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              {currentSeason && (
                <p className="text-xs text-[#C9A84C] bg-[#1a1500] border border-[#C9A84C]/30 px-3 py-2 rounded-md">
                  Creating a new season will deactivate &quot;{currentSeason.name}&quot;.
                </p>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Season'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
