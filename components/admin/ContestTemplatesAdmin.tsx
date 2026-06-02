'use client'

/**
 * ContestTemplatesAdmin — client component for managing contest templates.
 * Renders a table of templates with toggle, edit modal, and per-match
 * "Generate Contests" buttons.
 */

import { useState } from 'react'
import { cn }       from '@/lib/utils'
import type { ContestTemplate } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Match {
  id:           string
  match_number: number
  opponent_team: string
  match_date:   string
}

interface ContestTemplatesAdminProps {
  templates:    ContestTemplate[]
  matches:      Match[]
  clubSlug:     string
}

// ── Prize structure quick display ─────────────────────────────────────────────

function prizeLabel(type: string): string {
  switch (type) {
    case 'head_to_head':    return 'Winner 85%'
    case 'small_league':    return 'Top 3 split'
    case 'mega':            return 'Top 30% win'
    case 'winner_takes_all': return 'Winner 85%'
    case 'practice':        return 'No prize'
    default:                return type
  }
}

const TYPE_LABELS: Record<string, { label: string; colour: string }> = {
  head_to_head:    { label: 'H2H',         colour: 'bg-blue-100 text-blue-700' },
  small_league:    { label: 'Small League', colour: 'bg-gray-100 text-gray-700' },
  mega:            { label: 'Mega',         colour: 'bg-red-100 text-red-700' },
  winner_takes_all: { label: 'Jackpot',     colour: 'bg-[#fef9ee] text-[#C9A84C]' },
  practice:        { label: 'Practice',     colour: 'bg-green-100 text-green-700' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ContestTemplatesAdmin({
  templates: initial,
  matches,
  clubSlug,
}: ContestTemplatesAdminProps) {
  const [templates,  setTemplates]  = useState<ContestTemplate[]>(initial)
  const [editing,    setEditing]    = useState<ContestTemplate | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)   // matchId
  const [genResult,  setGenResult]  = useState<Record<string, string>>({})
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // ── Toggle active ──────────────────────────────────────────────────────────
  async function toggleActive(template: ContestTemplate) {
    const updated = { ...template, is_active: !template.is_active }
    setTemplates((prev) => prev.map((t) => t.id === template.id ? updated : t))

    const res = await fetch(`/api/admin/contest-templates/${template.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_active: updated.is_active }),
    })
    if (!res.ok) {
      // Revert on failure
      setTemplates((prev) => prev.map((t) => t.id === template.id ? template : t))
    }
  }

  // ── Save edit ──────────────────────────────────────────────────────────────
  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    setError(null)

    const form   = e.currentTarget
    const data   = new FormData(form)
    const patch  = {
      name:             data.get('name') as string,
      entry_fee:        Number(data.get('entry_fee')),
      max_entries:      Number(data.get('max_entries')),
      platform_fee_pct: Number(data.get('platform_fee_pct')),
      is_guaranteed:    (data.get('is_guaranteed') === 'true'),
      auto_create:      (data.get('auto_create') === 'true'),
    }

    const res = await fetch(`/api/admin/contest-templates/${editing.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    })

    if (res.ok) {
      const updated = { ...editing, ...patch }
      setTemplates((prev) => prev.map((t) => t.id === editing.id ? updated : t))
      setEditing(null)
    } else {
      const json = await res.json() as { error?: string }
      setError(json.error ?? 'Failed to save')
    }
    setSaving(false)
  }

  // ── Generate contests for a match ─────────────────────────────────────────
  async function generateContests(matchId: string) {
    setGenerating(matchId)
    setGenResult((prev) => ({ ...prev, [matchId]: '' }))

    const res = await fetch(`/api/admin/generate-contests/${matchId}`, { method: 'POST' })
    const json = await res.json() as { created?: number; match?: string; error?: string }

    setGenResult((prev) => ({
      ...prev,
      [matchId]: res.ok
        ? `✓ Created ${json.created} contest${json.created === 1 ? '' : 's'}`
        : `✗ ${json.error ?? 'Error'}`,
    }))
    setGenerating(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* ── Templates table ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-black text-gray-900 mb-4">Contest Templates</h2>
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Name</th>
                  <th className="text-left text-xs font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Type</th>
                  <th className="text-right text-xs font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Entry</th>
                  <th className="text-right text-xs font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Max</th>
                  <th className="text-left text-xs font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Prize Structure</th>
                  <th className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Auto</th>
                  <th className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Active</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {templates.map((t) => {
                  const meta = TYPE_LABELS[t.type] ?? { label: t.type, colour: 'bg-gray-100 text-gray-700' }
                  return (
                    <tr key={t.id} className={cn('hover:bg-gray-50 transition-colors', !t.is_active && 'opacity-50')}>
                      <td className="px-4 py-3 font-semibold text-gray-800">{t.name}</td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', meta.colour)}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800">
                        {t.entry_fee > 0 ? `£${t.entry_fee}` : 'Free'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{t.max_entries}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{prizeLabel(t.type)}</td>
                      <td className="px-4 py-3 text-center">
                        {t.auto_create
                          ? <span className="text-green-600 font-bold text-xs">Yes</span>
                          : <span className="text-gray-400 text-xs">No</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleActive(t)}
                          className={cn(
                            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                            t.is_active ? 'bg-[#C9A84C]' : 'bg-gray-200',
                          )}
                          title={t.is_active ? 'Click to deactivate' : 'Click to activate'}
                        >
                          <span className={cn(
                            'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                            t.is_active ? 'translate-x-4' : 'translate-x-0.5',
                          )} />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setEditing(t)}
                          className="text-xs text-[#C9A84C] hover:underline font-semibold"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Generate contests per match ───────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-black text-gray-900 mb-4">Generate Contests for Match</h2>
        {matches.length === 0 ? (
          <p className="text-gray-400 text-sm">No upcoming matches.</p>
        ) : (
          <div className="space-y-2">
            {matches.map((m) => (
              <div key={m.id}
                className="flex items-center justify-between rounded-xl bg-white border border-gray-200 px-4 py-3 shadow-sm"
              >
                <div>
                  <p className="font-semibold text-gray-800 text-sm">
                    GW{m.match_number} vs {m.opponent_team}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(m.match_date).toLocaleDateString('en-GB', {
                      weekday: 'short', day: 'numeric', month: 'short',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {genResult[m.id] && (
                    <span className={cn(
                      'text-xs font-semibold',
                      genResult[m.id].startsWith('✓') ? 'text-green-600' : 'text-red-500',
                    )}>
                      {genResult[m.id]}
                    </span>
                  )}
                  <button
                    onClick={() => generateContests(m.id)}
                    disabled={generating === m.id}
                    className="px-3 py-1.5 rounded-lg bg-[#C9A84C] text-black text-xs font-black hover:bg-[#a8892e] disabled:opacity-60 transition-colors"
                  >
                    {generating === m.id ? 'Generating…' : 'Generate Contests'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Edit modal ────────────────────────────────────────────────────── */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-200 backdrop-blur-sm p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">Edit Template</p>
              <p className="text-lg font-black text-gray-900">{editing.name}</p>
            </div>

            <form onSubmit={saveEdit} className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-widest">Name</label>
                <input
                  name="name"
                  defaultValue={editing.name}
                  required
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-widest">Entry Fee (£)</label>
                  <input
                    name="entry_fee"
                    type="number"
                    min={0}
                    step={0.50}
                    defaultValue={editing.entry_fee}
                    required
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-widest">Max Entries</label>
                  <input
                    name="max_entries"
                    type="number"
                    min={2}
                    defaultValue={editing.max_entries}
                    required
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-widest">Platform Fee %</label>
                <input
                  name="platform_fee_pct"
                  type="number"
                  min={0}
                  max={50}
                  defaultValue={editing.platform_fee_pct}
                  required
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
                />
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    name="is_guaranteed"
                    value="true"
                    defaultChecked={editing.is_guaranteed}
                    className="rounded accent-[#C9A84C]"
                  />
                  Guaranteed prize pool
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    name="auto_create"
                    value="true"
                    defaultChecked={editing.auto_create}
                    className="rounded accent-[#C9A84C]"
                  />
                  Auto-create
                </label>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-[#C9A84C] text-black font-black text-sm hover:bg-[#a8892e] disabled:opacity-60 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
