'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AdminTransferAdjustProps {
  fantasyTeamId: string
  teamName: string
}

export default function AdminTransferAdjust({ fantasyTeamId, teamName }: AdminTransferAdjustProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    const parsed = parseInt(amount)
    if (isNaN(parsed) || parsed === 0) {
      setError('Enter a non-zero number (negative to give back transfers)')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: insertErr } = await supabase.from('transfer_logs').insert({
      fantasy_team_id: fantasyTeamId,
      match_id: null,
      players_in: [],
      players_out: [],
      transfers_used: parsed,
      admin_adjustment: true,
      admin_note: note.trim() || null,
    })
    setSaving(false)
    if (insertErr) { setError(insertErr.message); return }
    setOpen(false)
    setAmount('')
    setNote('')
    router.refresh()
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="text-xs" onClick={() => setOpen(true)}>
        Adjust
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 items-end min-w-[200px]">
      <p className="text-xs text-muted-foreground text-left w-full">{teamName}</p>
      <Input
        type="number"
        placeholder="e.g. -10 to give 10 back"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="h-7 text-xs"
      />
      <Input
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="h-7 text-xs"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" className="h-7 text-xs bg-[#262162] hover:bg-[#1a1748]" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
