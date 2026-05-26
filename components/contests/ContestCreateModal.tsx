'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Props {
  seasonId:       string
  myFantasyTeamId: string | null
  userId:         string
}

function generateCode(): string {
  // Unambiguous uppercase alphanumeric (no 0/O, 1/I/L)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)],
  ).join('')
}

export default function ContestCreateModal({ seasonId, myFantasyTeamId, userId }: Props) {
  const router = useRouter()
  const [open, setOpen]           = useState(false)
  const [name, setName]           = useState('')
  const [maxTeams, setMaxTeams]   = useState(20)
  const [prize, setPrize]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [created, setCreated]     = useState<{ code: string; id: string } | null>(null)
  const [copied, setCopied]       = useState(false)

  async function handleCreate() {
    if (!name.trim()) { setError('Please enter a league name.'); return }
    if (!myFantasyTeamId) { setError('You need a fantasy team to create a private league.'); return }

    setSaving(true)
    setError(null)
    const supabase = createClient()
    const code = generateCode()

    // Insert contest
    const { data: contest, error: cErr } = await supabase
      .from('contests')
      .insert({
        season_id:         seasonId,
        name:              name.trim(),
        type:              'private',
        entry_code:        code,
        max_teams:         maxTeams,
        prize_description: prize.trim() || null,
        created_by:        userId,
      })
      .select()
      .single()

    if (cErr) { setError(cErr.message); setSaving(false); return }

    // Auto-join creator
    const { error: eErr } = await supabase.from('contest_entries').insert({
      contest_id:      contest.id,
      fantasy_team_id: myFantasyTeamId,
    })
    if (eErr) console.warn('Auto-join failed:', eErr.message)

    setSaving(false)
    setCreated({ code, id: contest.id })
    router.refresh()
  }

  function handleCopy() {
    if (created) {
      navigator.clipboard.writeText(created.code).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function handleClose() {
    setOpen(false)
    setName(''); setMaxTeams(20); setPrize('')
    setError(null); setCreated(null); setCopied(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2.5 rounded-xl bg-[#262162] text-white text-sm font-bold hover:bg-[#1a1748] transition-colors"
      >
        + Create Private League
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-[#262162] px-6 py-5">
              <h2 className="text-white font-black text-lg">Create Private League</h2>
              <p className="text-white/60 text-sm mt-0.5">
                Invite friends with a unique 6-character code.
              </p>
            </div>

            <div className="p-6 space-y-4">
              {!created ? (
                <>
                  {/* League name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
                      League Name *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Slough Cricket Legends"
                      maxLength={60}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#262162] focus:ring-1 focus:ring-[#262162]/20 transition-colors"
                    />
                  </div>

                  {/* Max teams */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
                      Max Teams
                    </label>
                    <select
                      value={maxTeams}
                      onChange={(e) => setMaxTeams(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#262162] focus:ring-1 focus:ring-[#262162]/20 transition-colors"
                    >
                      {[5, 10, 15, 20, 30, 50, 100].map((n) => (
                        <option key={n} value={n}>{n} teams</option>
                      ))}
                    </select>
                  </div>

                  {/* Prize description */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
                      Prize Description <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      value={prize}
                      onChange={(e) => setPrize(e.target.value)}
                      placeholder="e.g. Winner gets a free drink at the next home match"
                      rows={2}
                      maxLength={200}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#262162] focus:ring-1 focus:ring-[#262162]/20 transition-colors resize-none"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleClose}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={saving}
                      className="flex-1 py-2.5 rounded-xl bg-[#262162] text-white text-sm font-black hover:bg-[#1a1748] disabled:opacity-60 transition-colors"
                    >
                      {saving ? 'Creating…' : 'Create League'}
                    </button>
                  </div>
                </>
              ) : (
                /* ── Success state: show invite code ── */
                <div className="space-y-5 text-center">
                  <div className="text-4xl">🎉</div>
                  <div>
                    <p className="font-bold text-gray-800 text-lg">{name}</p>
                    <p className="text-gray-500 text-sm mt-0.5">Your private league is ready.</p>
                  </div>

                  <div className="bg-[#eeedf8] rounded-2xl p-5">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#262162]/60 mb-2">
                      Invite Code
                    </p>
                    <p className="text-4xl font-black tracking-[0.3em] text-[#262162] font-mono">
                      {created.code}
                    </p>
                  </div>

                  <button
                    onClick={handleCopy}
                    className={cn(
                      'w-full py-3 rounded-xl font-bold text-sm transition-all',
                      copied
                        ? 'bg-green-500 text-white'
                        : 'bg-[#262162] text-white hover:bg-[#1a1748]',
                    )}
                  >
                    {copied ? '✓ Copied!' : 'Copy Invite Code'}
                  </button>

                  <button
                    onClick={() => {
                      handleClose()
                      router.push(`/contests/${created.id}`)
                    }}
                    className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
                  >
                    View League →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
