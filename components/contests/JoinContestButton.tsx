'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Props {
  contestId:       string
  fantasyTeamId:   string | null
  alreadyJoined:   boolean
  isFull:          boolean
}

export default function JoinContestButton({
  contestId,
  fantasyTeamId,
  alreadyJoined,
  isFull,
}: Props) {
  const router    = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  if (alreadyJoined) {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 text-xs font-bold">
        ✓ Joined
      </span>
    )
  }

  if (isFull) {
    return (
      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 text-xs font-bold cursor-not-allowed">
        Full
      </span>
    )
  }

  if (!fantasyTeamId) {
    return (
      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 text-xs font-bold">
        Need a team
      </span>
    )
  }

  async function handleJoin() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const { error: err } = await supabase.from('contest_entries').insert({
      contest_id:      contestId,
      fantasy_team_id: fantasyTeamId,
    })

    if (err) { setError(err.message); setLoading(false); return }
    setLoading(false)
    router.refresh()
  }

  return (
    <div>
      <button
        onClick={handleJoin}
        disabled={loading}
        className={cn(
          'px-4 py-1.5 rounded-lg text-xs font-bold transition-all',
          loading
            ? 'bg-gray-100 text-gray-400 cursor-wait'
            : 'bg-[#262162] text-white hover:bg-[#1a1748]',
        )}
      >
        {loading ? 'Joining…' : 'Join'}
      </button>
      {error && <p className="mt-1 text-[10px] text-red-500">{error}</p>}
    </div>
  )
}
