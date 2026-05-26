'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Match } from '@/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface MatchFormProps {
  seasonId: string
  nextMatchNumber: number
  match?: Match
}

export default function MatchForm({ seasonId, nextMatchNumber, match }: MatchFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [opponent, setOpponent] = useState(match?.opponent ?? '')
  const [venue, setVenue] = useState(match?.venue ?? '')
  const [matchDate, setMatchDate] = useState(
    match?.match_date ? new Date(match.match_date).toISOString().slice(0, 16) : ''
  )
  const [matchNumber, setMatchNumber] = useState(String(match?.match_number ?? nextMatchNumber))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const payload = {
      opponent: opponent.trim(),
      venue: venue.trim() || null,
      match_date: new Date(matchDate).toISOString(),
      match_number: parseInt(matchNumber),
      season_id: seasonId,
    }

    if (match) {
      const { error: err } = await supabase.from('matches').update(payload).eq('id', match.id)
      if (err) { setError(err.message); setLoading(false); return }
    } else {
      const { error: err } = await supabase.from('matches').insert(payload)
      if (err) { setError(err.message); setLoading(false); return }

      // Fire-and-forget push notification to all subscribers about new match
      fetch('/api/push/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type:        'new_match',
          opponent:    payload.opponent,
          matchDate:   payload.match_date,
          matchNumber: payload.match_number,
        }),
      }).catch(() => {/* ignore */})
    }

    setOpen(false)
    router.refresh()
    setLoading(false)
    if (!match) { setOpponent(''); setVenue(''); setMatchDate('') }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button className={cn(buttonVariants({ variant: match ? 'ghost' : 'default', size: 'sm' }))} />
        }
      >
        {match ? 'Edit' : 'Add Match'}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{match ? 'Edit Match' : 'Add Match'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Match Number</Label>
              <Input type="number" value={matchNumber} onChange={(e) => setMatchNumber(e.target.value)} min={1} required />
            </div>
            <div className="space-y-1.5">
              <Label>Opponent</Label>
              <Input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="e.g. Riverside CC" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Venue (optional)</Label>
            <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Home Ground" />
          </div>
          <div className="space-y-1.5">
            <Label>Date & Time</Label>
            <Input type="datetime-local" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} required />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
