'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  seasonId: string
  userId:   string
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)],
  ).join('')
}

export default function AdminCreateContest({ seasonId, userId }: Props) {
  const router = useRouter()
  const [open, setOpen]         = useState(false)
  const [name, setName]         = useState('')
  const [type, setType]         = useState<'public' | 'private' | 'open_league'>('public')
  const [maxTeams, setMaxTeams] = useState(100)
  const [prize, setPrize]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [done, setDone]         = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim()) { setError('Contest name is required.'); return }
    setSaving(true)
    setError(null)
    const supabase = createClient()

    const entryCode = type === 'private' ? generateCode() : null
    const isOpenLeague = type === 'open_league'

    const { data, error: err } = await supabase
      .from('contests')
      .insert({
        season_id:         seasonId,
        name:              name.trim(),
        type:              isOpenLeague ? 'open_league' : type,
        entry_code:        entryCode,
        max_teams:         isOpenLeague ? null : maxTeams,
        entry_fee:         isOpenLeague ? 4 : undefined,
        platform_fee_pct:  isOpenLeague ? 15 : undefined,
        prize_structure:   isOpenLeague
          ? [{ rank_from: 1, rank_to: 1, prize_pct: 45 }, { rank_from: 2, rank_to: 2, prize_pct: 35 }, { rank_from: 3, rank_to: 3, prize_pct: 20 }]
          : undefined,
        prize_description: prize.trim() || null,
        created_by:        userId,
      })
      .select()
      .single()

    if (err) { setError(err.message); setSaving(false); return }

    setSaving(false)
    setDone(entryCode ?? (type === 'open_league' ? '(open league — unlimited entries)' : '(public — anyone can join)'))
    router.refresh()
  }

  function handleClose() {
    setOpen(false)
    setName(''); setType('public'); setMaxTeams(100); setPrize('')
    setError(null); setDone(null)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-xl bg-[#f0f0f0] text-[#0b0b0b] text-sm font-bold hover:bg-[#fafafa] transition-colors"
      >
        + Create Contest
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-200 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <div
            className="w-full max-w-md bg-[#f0f0f0] rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#f0f0f0] px-6 py-4">
              <h2 className="text-[#0b0b0b] font-black text-lg">Create Contest</h2>
              <p className="text-[#0b0b0b]/60 text-sm">Admin — create a public or private contest</p>
            </div>

            <div className="p-6 space-y-4">
              {!done ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Season Champions League"
                      maxLength={60}
                      className="w-full px-3 py-2.5 rounded-xl border border-[#d8d8d8] text-sm text-[#444444] placeholder:text-gray-400 focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Type</label>
                    <div className="flex gap-2 flex-wrap">
                      {([
                        { value: 'public',      label: 'Public' },
                        { value: 'private',     label: 'Private' },
                        { value: 'open_league', label: '🌐 Open League' },
                      ] as const).map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => setType(value)}
                          className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                            type === value
                              ? 'bg-[#f0f0f0] border-[#C9A84C] text-[#0b0b0b]'
                              : 'bg-[#f0f0f0] border-[#d8d8d8] text-gray-600 hover:border-[#C9A84C]/40'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {type === 'public' && <p className="text-xs text-gray-400">Anyone with a team can join from the contests page.</p>}
                    {type === 'private' && <p className="text-xs text-gray-400">A unique 6-character code will be generated for invites.</p>}
                    {type === 'open_league' && (
                      <p className="text-xs text-violet-600 font-medium">
                        Unlimited entries · £4 fee · Prize pot calculated at gameweek lock (entries × £4 × 0.85). Top 3 split 45/35/20%.
                      </p>
                    )}
                  </div>

                  {type !== 'open_league' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Max Teams</label>
                      <select
                        value={maxTeams}
                        onChange={(e) => setMaxTeams(Number(e.target.value))}
                        className="w-full px-3 py-2.5 rounded-xl border border-[#d8d8d8] text-sm text-[#444444] bg-[#f0f0f0] focus:outline-none focus:border-[#C9A84C] transition-colors"
                      >
                        {[10, 20, 50, 100, 200, 500].map((n) => (
                          <option key={n} value={n}>{n} teams</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
                      Prize Description <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      value={prize}
                      onChange={(e) => setPrize(e.target.value)}
                      placeholder="e.g. Trophy + £50 bar tab for the winner"
                      rows={2}
                      maxLength={200}
                      className="w-full px-3 py-2.5 rounded-xl border border-[#d8d8d8] text-sm text-[#444444] placeholder:text-gray-400 focus:outline-none focus:border-[#C9A84C] transition-colors resize-none"
                    />
                  </div>

                  {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

                  <div className="flex gap-2 pt-1">
                    <button onClick={handleClose} className="flex-1 py-2.5 rounded-xl border border-[#d8d8d8] text-gray-600 text-sm font-semibold hover:bg-[#f8f8f8] transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={saving}
                      className="flex-1 py-2.5 rounded-xl bg-[#f0f0f0] text-[#0b0b0b] text-sm font-black hover:bg-[#fafafa] disabled:opacity-60 transition-colors"
                    >
                      {saving ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center space-y-4">
                  <div className="text-4xl">✅</div>
                  <p className="font-bold text-[#444444]">{name} created!</p>
                  {type === 'private' && (
                    <div className="bg-[#f0f0f0] rounded-xl p-4">
                      <p className="text-xs font-bold uppercase tracking-widest text-[#C9A84C]/60 mb-1">Invite Code</p>
                      <p className="text-3xl font-black tracking-[0.3em] text-[#C9A84C] font-mono">{done}</p>
                    </div>
                  )}
                  {type === 'open_league' && (
                    <p className="text-sm text-violet-600 font-medium">Unlimited entries open. Prize pot grows as players join — frozen at gameweek lock.</p>
                  )}
                  <button onClick={handleClose} className="w-full py-2.5 rounded-xl bg-[#f0f0f0] text-[#0b0b0b] text-sm font-bold hover:bg-[#fafafa] transition-colors">
                    Done
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
