'use client'

import { useState } from 'react'
import { cn }       from '@/lib/utils'

interface MatchOption {
  id:             string
  match_number:   number
  opponent:       string
  match_date:     string
  play_cricket_id: string | null
}

interface Props {
  seasonId:   string
  seasonYear: string
  matches:    MatchOption[]
}

type SyncState = 'idle' | 'loading' | 'done' | 'error'

interface SyncResult {
  state:   SyncState
  message: string
  ts:      string | null
}

function now() { return new Date().toLocaleTimeString('en-GB') }

function SyncSection({
  title, description, children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
        <p className="font-bold text-sm text-gray-800">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="px-5 py-4 space-y-3">{children}</div>
    </div>
  )
}

function StatusBadge({ result }: { result: SyncResult }) {
  if (result.state === 'idle') return null
  return (
    <div className={cn(
      'rounded-lg px-3 py-2 text-xs font-semibold',
      result.state === 'loading' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
      result.state === 'done'    ? 'bg-green-50 text-green-700 border border-green-200' :
                                   'bg-red-50 text-red-600 border border-red-200',
    )}>
      {result.state === 'loading' ? '⏳ ' : result.state === 'done' ? '✓ ' : '✗ '}
      {result.message}
      {result.ts && <span className="ml-2 opacity-60">· {result.ts}</span>}
    </div>
  )
}

export default function SyncPanel({ seasonId, seasonYear, matches }: Props) {
  // ── Sync Matches ──────────────────────────────────────────────────────────
  const [matchSync, setMatchSync] = useState<SyncResult>({ state: 'idle', message: '', ts: null })

  async function syncMatches() {
    setMatchSync({ state: 'loading', message: 'Fetching matches from Play Cricket…', ts: null })
    try {
      const res  = await fetch('/api/sync/matches', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ season_id: seasonId, season_year: seasonYear }),
      })
      const j = await res.json() as {
        imported?: number; updated?: number; skipped?: number
        auto_xi_synced?: number; message?: string; error?: string
      }
      if (res.ok) {
        const xiMsg = (j.auto_xi_synced ?? 0) > 0 ? ` · ${j.auto_xi_synced} XI${j.auto_xi_synced === 1 ? '' : 's'} auto-synced` : ''
        setMatchSync({ state: 'done', message: `${j.imported ?? 0} imported, ${j.updated ?? 0} updated${xiMsg}`, ts: now() })
      } else {
        setMatchSync({ state: 'error', message: j.error ?? 'Error', ts: now() })
      }
    } catch (e: unknown) {
      setMatchSync({ state: 'error', message: (e as Error).message, ts: now() })
    }
  }

  // ── Quick XI by Play Cricket ID ───────────────────────────────────────────
  const [quickXiPcId, setQuickXiPcId] = useState('')
  const [quickXiSync, setQuickXiSync] = useState<SyncResult>({ state: 'idle', message: '', ts: null })

  async function quickSyncXI() {
    if (!quickXiPcId.trim()) {
      setQuickXiSync({ state: 'error', message: 'Enter a Play Cricket match ID', ts: null })
      return
    }
    setQuickXiSync({ state: 'loading', message: 'Looking up match…', ts: null })
    try {
      const res1  = await fetch('/api/admin/match-by-pc-id?pc_id=' + quickXiPcId.trim())
      const json1 = await res1.json() as { data: { id: string } | null; error?: string }
      if (!json1.data) {
        setQuickXiSync({ state: 'error', message: json1.error ?? 'No match found with that Play Cricket ID.', ts: now() })
        return
      }
      setQuickXiSync({ state: 'loading', message: 'Fetching playing XI from Play Cricket…', ts: null })
      const res2 = await fetch('/api/sync/playing-xi', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ match_id: json1.data.id, pc_match_id: quickXiPcId.trim() }),
      })
      const j = await res2.json() as { matched?: number; unmatched_names?: string[]; error?: string }
      if (res2.ok) {
        const unmatchedStr = j.unmatched_names?.length ? ` · Unmatched: ${j.unmatched_names.join(', ')}` : ''
        setQuickXiSync({ state: 'done', message: `${j.matched ?? 0} players matched${unmatchedStr}`, ts: now() })
        setQuickXiPcId('')
      } else {
        setQuickXiSync({ state: 'error', message: j.error ?? 'Error', ts: now() })
      }
    } catch (e: unknown) {
      setQuickXiSync({ state: 'error', message: (e as Error).message, ts: now() })
    }
  }

  // ── Quick Results by Play Cricket ID ──────────────────────────────────────
  const [quickResPcId, setQuickResPcId] = useState('')
  const [quickResSync, setQuickResSync] = useState<SyncResult>({ state: 'idle', message: '', ts: null })

  async function quickImportResults() {
    if (!quickResPcId.trim()) {
      setQuickResSync({ state: 'error', message: 'Enter a Play Cricket match ID', ts: null })
      return
    }
    setQuickResSync({ state: 'loading', message: 'Looking up match…', ts: null })
    try {
      const res1  = await fetch('/api/admin/match-by-pc-id?pc_id=' + quickResPcId.trim())
      const json1 = await res1.json() as { data: { id: string } | null; error?: string }
      if (!json1.data) {
        setQuickResSync({ state: 'error', message: json1.error ?? 'No match found with that Play Cricket ID.', ts: now() })
        return
      }
      setQuickResSync({ state: 'loading', message: 'Fetching scorecard & calculating points…', ts: null })
      const res2 = await fetch('/api/sync/results', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ match_id: json1.data.id, pc_match_id: quickResPcId.trim() }),
      })
      const j = await res2.json() as { players_synced?: number; teams_updated?: number; error?: string }
      if (res2.ok) {
        setQuickResSync({ state: 'done', message: `${j.players_synced ?? 0} players synced · ${j.teams_updated ?? 0} contest teams updated`, ts: now() })
        setQuickResPcId('')
      } else {
        setQuickResSync({ state: 'error', message: j.error ?? 'Error', ts: now() })
      }
    } catch (e: unknown) {
      setQuickResSync({ state: 'error', message: (e as Error).message, ts: now() })
    }
  }

  // ── Sync Playing XI ───────────────────────────────────────────────────────
  const [xiMatchId,  setXiMatchId]  = useState('')
  const [pcXiId,     setPcXiId]     = useState('')
  const [xiSync,     setXiSync]     = useState<SyncResult>({ state: 'idle', message: '', ts: null })

  async function syncXI() {
    if (!xiMatchId || !pcXiId) {
      setXiSync({ state: 'error', message: 'Select a match and enter the Play Cricket match ID', ts: null })
      return
    }
    setXiSync({ state: 'loading', message: 'Fetching playing XI from Play Cricket…', ts: null })
    try {
      const res = await fetch('/api/sync/playing-xi', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ match_id: xiMatchId, pc_match_id: pcXiId }),
      })
      const j = await res.json() as {
        matched?: number; unmatched?: number; unmatched_names?: string[]; error?: string
      }
      if (res.ok) {
        const unmatchedStr = j.unmatched_names?.length
          ? ` · Unmatched: ${j.unmatched_names.join(', ')}`
          : ''
        setXiSync({ state: 'done', message: `${j.matched ?? 0} players matched${unmatchedStr}`, ts: now() })
      } else {
        setXiSync({ state: 'error', message: j.error ?? 'Error', ts: now() })
      }
    } catch (e: unknown) {
      setXiSync({ state: 'error', message: (e as Error).message, ts: now() })
    }
  }

  // ── Sync Results ──────────────────────────────────────────────────────────
  const [resultMatchId, setResultMatchId] = useState('')
  const [pcResultId,    setPcResultId]    = useState('')
  const [resultSync,    setResultSync]    = useState<SyncResult>({ state: 'idle', message: '', ts: null })

  async function syncResults() {
    if (!resultMatchId) {
      setResultSync({ state: 'error', message: 'Select a match', ts: null })
      return
    }
    setResultSync({ state: 'loading', message: 'Fetching scorecard from Play Cricket…', ts: null })
    try {
      const body: Record<string, string> = { match_id: resultMatchId }
      if (pcResultId) body.pc_match_id = pcResultId

      const res = await fetch('/api/sync/results', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const j = await res.json() as {
        players_synced?: number; contests_updated?: number; teams_updated?: number; error?: string
      }
      if (res.ok) {
        setResultSync({
          state:   'done',
          message: `${j.players_synced ?? 0} players synced · ${j.teams_updated ?? 0} contest teams updated`,
          ts:      now(),
        })
      } else {
        setResultSync({ state: 'error', message: j.error ?? 'Error', ts: now() })
      }
    } catch (e: unknown) {
      setResultSync({ state: 'error', message: (e as Error).message, ts: now() })
    }
  }

  // ── Live Sync ─────────────────────────────────────────────────────────────
  const [liveSync, setLiveSync] = useState<SyncResult>({ state: 'idle', message: '', ts: null })

  async function syncLive() {
    setLiveSync({ state: 'loading', message: 'Checking live matches…', ts: null })
    try {
      const res = await fetch('/api/sync/live', { method: 'POST', body: '{}' })
      const j   = await res.json() as { matches_synced?: number; message?: string; error?: string }
      if (res.ok) {
        setLiveSync({ state: 'done', message: j.message ?? `${j.matches_synced ?? 0} live matches updated`, ts: now() })
      } else {
        setLiveSync({ state: 'error', message: j.error ?? 'Error', ts: now() })
      }
    } catch (e: unknown) {
      setLiveSync({ state: 'error', message: (e as Error).message, ts: now() })
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
  }

  function matchLabel(m: MatchOption) {
    const date = new Date(m.match_date).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
    return `${ordinal(m.match_number)} XI vs ${m.opponent} · ${date}`
  }

  function selectClass() {
    return 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-colors'
  }

  function inputClass() {
    return 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-colors'
  }

  function btnClass(color: 'gold' | 'gray' = 'gold', disabled = false) {
    return cn(
      'px-4 py-2.5 rounded-xl text-sm font-black transition-colors',
      disabled ? 'opacity-50 cursor-not-allowed' :
      color === 'gold'
        ? 'bg-[#C9A84C] text-black hover:bg-[#a8892e]'
        : 'border border-gray-200 text-gray-700 hover:border-[#C9A84C]/40 hover:text-[#C9A84C]',
    )
  }

  return (
    <div className="space-y-5">
      {/* ── 1. Sync Matches ──────────────────────────────────────────────── */}
      <SyncSection
        title="Sync Matches"
        description="Pull this season's fixtures and results from Play Cricket into the database."
      >
        <StatusBadge result={matchSync} />
        <button
          onClick={() => void syncMatches()}
          disabled={matchSync.state === 'loading'}
          className={btnClass('gold', matchSync.state === 'loading')}
        >
          {matchSync.state === 'loading' ? 'Syncing…' : '↓ Sync Matches from Play Cricket'}
        </button>
      </SyncSection>

      {/* ── 1b. Sync Playing XI by PC ID ─────────────────────────────────── */}
      <SyncSection
        title="Sync Playing XI by Play Cricket ID"
        description="Enter a Play Cricket match ID to import the confirmed team sheet — no dropdown needed."
      >
        <div className="flex gap-3">
          <input
            type="text"
            value={quickXiPcId}
            onChange={e => setQuickXiPcId(e.target.value)}
            placeholder="e.g. 7276987"
            className={inputClass() + ' flex-1'}
          />
          <button
            onClick={() => void quickSyncXI()}
            disabled={quickXiSync.state === 'loading'}
            className={btnClass('gold', quickXiSync.state === 'loading')}
          >
            {quickXiSync.state === 'loading' ? 'Syncing…' : '↓ Sync Playing XI'}
          </button>
        </div>
        <StatusBadge result={quickXiSync} />
      </SyncSection>

      {/* ── 1c. Import Results & Calc Points by PC ID ────────────────────── */}
      <SyncSection
        title="Import Results & Calc Points by Play Cricket ID"
        description="Enter a Play Cricket match ID to import the final scorecard and calculate fantasy points — no dropdown needed."
      >
        <div className="flex gap-3">
          <input
            type="text"
            value={quickResPcId}
            onChange={e => setQuickResPcId(e.target.value)}
            placeholder="e.g. 7276987"
            className={inputClass() + ' flex-1'}
          />
          <button
            onClick={() => void quickImportResults()}
            disabled={quickResSync.state === 'loading'}
            className={btnClass('gold', quickResSync.state === 'loading')}
          >
            {quickResSync.state === 'loading' ? 'Importing…' : '↓ Import & Calc Points'}
          </button>
        </div>
        <StatusBadge result={quickResSync} />
      </SyncSection>

      {/* ── 2. Sync Playing XI ───────────────────────────────────────────── */}
      <SyncSection
        title="Sync Playing XI"
        description="Import the confirmed 11 from Play Cricket into the match_playing_xi table. Enables the team-picker to show only confirmed squad players."
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Our Match</label>
            <select value={xiMatchId} onChange={e => {
              setXiMatchId(e.target.value)
              const m = matches.find(m => m.id === e.target.value)
              if (m?.play_cricket_id) setPcXiId(m.play_cricket_id)
            }} className={selectClass()}>
              <option value="">Select match…</option>
              {matches.map(m => (
                <option key={m.id} value={m.id}>{matchLabel(m)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
              Play Cricket Match ID
              <span className="ml-1.5 text-gray-400 font-normal normal-case">
                (from the URL: /results/<strong>7276987</strong>)
              </span>
            </label>
            <input
              type="text"
              value={pcXiId}
              onChange={e => setPcXiId(e.target.value)}
              placeholder="e.g. 7276987"
              className={inputClass()}
            />
          </div>
        </div>
        <StatusBadge result={xiSync} />
        <button
          onClick={() => void syncXI()}
          disabled={xiSync.state === 'loading'}
          className={btnClass('gold', xiSync.state === 'loading')}
        >
          {xiSync.state === 'loading' ? 'Syncing…' : '↓ Sync Playing XI'}
        </button>
      </SyncSection>

      {/* ── 3. Sync Results ──────────────────────────────────────────────── */}
      <SyncSection
        title="Sync Results & Calculate Points"
        description="Import the final scorecard, calculate fantasy points for each player, and update all contest leaderboards."
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Match</label>
            <select value={resultMatchId} onChange={e => {
              setResultMatchId(e.target.value)
              const m = matches.find(m => m.id === e.target.value)
              if (m?.play_cricket_id) setPcResultId(m.play_cricket_id)
            }} className={selectClass()}>
              <option value="">Select match…</option>
              {matches.map(m => (
                <option key={m.id} value={m.id}>{matchLabel(m)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
              Play Cricket Match ID <span className="font-normal text-gray-400">(leave blank if synced)</span>
            </label>
            <input
              type="text"
              value={pcResultId}
              onChange={e => setPcResultId(e.target.value)}
              placeholder="e.g. 7276987"
              className={inputClass()}
            />
          </div>
        </div>
        <StatusBadge result={resultSync} />
        <button
          onClick={() => void syncResults()}
          disabled={resultSync.state === 'loading'}
          className={btnClass('gold', resultSync.state === 'loading')}
        >
          {resultSync.state === 'loading' ? 'Syncing…' : '↓ Sync Results & Calc Points'}
        </button>
      </SyncSection>

      {/* ── 4. Force Live Sync ───────────────────────────────────────────── */}
      <SyncSection
        title="Force Live Sync"
        description="Manually trigger a live score update (same as the automatic cron job). Use this during a match to update running points immediately."
      >
        <StatusBadge result={liveSync} />
        <button
          onClick={() => void syncLive()}
          disabled={liveSync.state === 'loading'}
          className={btnClass('gray', liveSync.state === 'loading')}
        >
          {liveSync.state === 'loading' ? 'Syncing…' : '⚡ Force Live Sync'}
        </button>
        <p className="text-xs text-gray-400">
          The cron job runs automatically every 5 minutes. Only use this to force an immediate update.
        </p>
      </SyncSection>
    </div>
  )
}
