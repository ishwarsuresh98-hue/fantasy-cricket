'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  myFantasyTeamId: string | null
}

export default function JoinWithCode({ myFantasyTeamId }: Props) {
  const router = useRouter()
  const [code, setCode]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length !== 6) { setError('Enter the 6-character invite code.'); return }
    if (!myFantasyTeamId) { setError('You need a fantasy team to join a league.'); return }

    setLoading(true)
    setError(null)
    const supabase = createClient()

    // Find contest by code
    const { data: contest, error: cErr } = await supabase
      .from('contests')
      .select('id, name, max_teams')
      .eq('entry_code', trimmed)
      .single()

    if (cErr || !contest) {
      setError('Invalid code — no league found. Check the code and try again.')
      setLoading(false)
      return
    }

    // Check entry count vs max
    const { count } = await supabase
      .from('contest_entries')
      .select('*', { count: 'exact', head: true })
      .eq('contest_id', contest.id)

    if ((count ?? 0) >= contest.max_teams) {
      setError('This league is full. Ask the creator to increase the limit.')
      setLoading(false)
      return
    }

    // Check already joined
    const { data: existing } = await supabase
      .from('contest_entries')
      .select('id')
      .eq('contest_id', contest.id)
      .eq('fantasy_team_id', myFantasyTeamId)
      .maybeSingle()

    if (existing) {
      setLoading(false)
      router.push(`/contests/${contest.id}`)
      return
    }

    // Join
    const { error: eErr } = await supabase.from('contest_entries').insert({
      contest_id:      contest.id,
      fantasy_team_id: myFantasyTeamId,
    })

    if (eErr) { setError(eErr.message); setLoading(false); return }

    setLoading(false)
    setCode('')
    router.refresh()
    router.push(`/contests/${contest.id}`)
  }

  return (
    <div className="rounded-2xl bg-[#f0f0f0] border border-[#d8d8d8] px-5 py-4">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
        Join with Invite Code
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null) }}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          placeholder="6-character code"
          maxLength={6}
          className="flex-1 px-3 py-2.5 rounded-xl border border-[#d8d8d8] text-sm font-mono uppercase text-[#444444] placeholder:text-gray-400 placeholder:normal-case placeholder:font-sans tracking-widest focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-colors"
        />
        <button
          onClick={handleJoin}
          disabled={loading || code.trim().length < 6}
          className="px-5 py-2.5 rounded-xl bg-[#f0f0f0] text-[#0b0b0b] text-sm font-bold hover:bg-[#fafafa] disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {loading ? 'Joining…' : 'Join League'}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600 font-medium">{error}</p>
      )}
    </div>
  )
}
