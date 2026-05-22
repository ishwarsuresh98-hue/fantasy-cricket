'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Player, MatchPerformance } from '@/types'
import { PLAYER_ROLE_LABELS, computeBasePoints } from '@/lib/scoring'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { ScrapeResult, ScrapedBatter, ScrapedBowler, ScrapedFielder } from '@/app/api/playcricket/scrape/route'

interface PlayerStats {
  runs: number
  balls: number
  fours: number
  sixes: number
  dnb: boolean
  wickets: number
  catches: number
  stumpings: number
  runOuts: number
  dotBalls: number
  maidens: number
}

interface StatsFormProps {
  matchId: string
  players: Player[]
  existingPerfs: Record<string, MatchPerformance>
  matchStatus: string
}

function defaultStats(perf?: MatchPerformance): PlayerStats {
  if (!perf) return { runs: 0, balls: 0, fours: 0, sixes: 0, dnb: false, wickets: 0, catches: 0, stumpings: 0, runOuts: 0, dotBalls: 0, maidens: 0 }
  return {
    runs: perf.runs_scored,
    balls: perf.balls_faced,
    fours: perf.fours,
    sixes: perf.sixes,
    dnb: perf.did_not_bat,
    wickets: perf.wickets,
    catches: perf.catches,
    stumpings: perf.stumpings,
    runOuts: perf.run_outs,
    dotBalls: perf.dot_balls,
    maidens: perf.maidens,
  }
}

const NUM = (v: string) => Math.max(0, parseInt(v) || 0)

// ── Play-Cricket name matching ─────────────────────────────────────────────────

/** Fuzzy-match a Play-Cricket name (e.g. "A Patel") to a player in our roster. */
function matchPlayer(scrapedName: string, players: Player[]): Player | null {
  const s = scrapedName.toLowerCase().trim()
  // 1. Exact (case-insensitive)
  const exact = players.find(p => p.name.toLowerCase() === s)
  if (exact) return exact

  const sParts = s.split(/\s+/)
  const sLast  = sParts[sParts.length - 1]
  const sFirst = sParts[0]

  // 2. All words present (handles abbreviated first names "A Patel" → "Asad Patel")
  const byWords = players.find(p => {
    const pWords = p.name.toLowerCase().split(/\s+/)
    // Every word in scraped name must start-match a word in player name
    return sParts.every(sw => pWords.some(pw => pw.startsWith(sw)))
  })
  if (byWords) return byWords

  // 3. Same last name + same first-initial
  const byLast = players.filter(p => {
    const pParts = p.name.toLowerCase().split(/\s+/)
    return pParts[pParts.length - 1] === sLast
  })
  if (byLast.length === 1) return byLast[0]
  if (byLast.length > 1 && sFirst) {
    const byInitial = byLast.find(p => p.name.toLowerCase().startsWith(sFirst))
    if (byInitial) return byInitial
  }

  return null
}

// ── Play-Cricket import panel ─────────────────────────────────────────────────

interface MatchRow {
  player: Player
  partial: Partial<PlayerStats>
  sources: string[]     // human-readable list of what was imported
}
interface UnmatchedRow {
  scrapedName: string
  details: string[]   // one entry per section (batting / bowling / fielding)
}

interface ImportPanelProps {
  matchId: string
  players: Player[]
  onApply: (rows: MatchRow[], newPlayers: Player[]) => void
}

function PlayCricketImportPanel({ matchId, players, onApply }: ImportPanelProps) {
  const [open,      setOpen]      = useState(false)
  const [tab,       setTab]       = useState<'url' | 'pdf'>('url')

  // URL tab state
  const [url,       setUrl]       = useState('')
  const [urlBusy,   setUrlBusy]   = useState(false)
  const [urlErr,    setUrlErr]    = useState<string | null>(null)

  // PDF tab state
  const [pdfFile,   setPdfFile]   = useState<File | null>(null)
  const [pdfBusy,   setPdfBusy]   = useState(false)
  const [pdfErr,    setPdfErr]    = useState<string | null>(null)
  const [dragOver,  setDragOver]  = useState(false)

  // Shared
  const [result,    setResult]    = useState<ScrapeResult | null>(null)
  const [applied,   setApplied]   = useState(false)
  const [creating,  setCreating]  = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)

  // ── Reset result whenever the user switches tabs ────────────────────────────
  function switchTab(t: 'url' | 'pdf') {
    setTab(t)
    setResult(null)
    setApplied(false)
    setUrlErr(null)
    setPdfErr(null)
  }

  // ── URL fetch ──────────────────────────────────────────────────────────────
  async function handleFetchUrl() {
    if (!url.trim()) return
    setUrlBusy(true)
    setUrlErr(null)
    setResult(null)
    setApplied(false)
    try {
      const res = await fetch('/api/playcricket/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (data.error) { setUrlErr(data.error); return }
      setResult(data as ScrapeResult)
    } catch {
      setUrlErr('Network error — could not reach the server.')
    } finally {
      setUrlBusy(false)
    }
  }

  // ── PDF upload ─────────────────────────────────────────────────────────────
  async function handleUploadPdf(file: File) {
    setPdfFile(file)
    setPdfBusy(true)
    setPdfErr(null)
    setResult(null)
    setApplied(false)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/playcricket/pdf', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) { setPdfErr(data.error); return }
      setResult(data as ScrapeResult)
    } catch {
      setPdfErr('Network error — could not reach the server.')
    } finally {
      setPdfBusy(false)
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUploadPdf(file)
    e.target.value = ''   // reset so same file can be re-selected
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUploadPdf(file)
  }

  // ── Build preview rows from scraped result (shared between both tabs) ───────
  const { matchRows, unmatched } = (() => {
    if (!result) return { matchRows: [] as MatchRow[], unmatched: [] as UnmatchedRow[] }

    const matchRows:  MatchRow[]                       = []
    const playerMap:  Map<string, Partial<PlayerStats>> = new Map()
    const sourcesMap: Map<string, string[]>             = new Map()

    // Keyed by lowercased+trimmed name so "Shanay Mehta", " shanay mehta",
    // "SHANAY MEHTA" all collapse to the same entry.
    const unmatchedDetails:  Map<string, string[]> = new Map()  // normKey → details[]
    const unmatchedDisplay:  Map<string, string>   = new Map()  // normKey → display name

    const addUnmatched = (rawName: string, detail: string) => {
      const key = rawName.trim().toLowerCase()
      if (!unmatchedDetails.has(key)) {
        unmatchedDetails.set(key, [])
        unmatchedDisplay.set(key, rawName.trim())  // keep first-seen capitalisation
      }
      unmatchedDetails.get(key)!.push(detail)
    }

    const get = (id: string) => {
      if (!playerMap.has(id)) { playerMap.set(id, {}); sourcesMap.set(id, []) }
      return playerMap.get(id)!
    }

    for (const b of result.batting as ScrapedBatter[]) {
      const p = matchPlayer(b.name, players)
      if (!p) { addUnmatched(b.name, b.dnb ? 'DNB' : `bat: ${b.runs}(${b.balls})`); continue }
      const s = get(p.id)
      s.runs = b.dnb ? 0 : b.runs;  s.balls = b.dnb ? 0 : b.balls
      s.fours = b.dnb ? 0 : b.fours; s.sixes = b.dnb ? 0 : b.sixes
      s.dnb = b.dnb
      sourcesMap.get(p.id)!.push(b.dnb ? 'DNB' : `${b.runs}(${b.balls}), ${b.fours}×4, ${b.sixes}×6`)
    }

    for (const b of result.bowling as ScrapedBowler[]) {
      const p = matchPlayer(b.name, players)
      if (!p) { addUnmatched(b.name, `bowl: ${b.wickets}/${b.overs}ov`); continue }
      const s = get(p.id)
      s.wickets = b.wickets; s.maidens = b.maidens
      sourcesMap.get(p.id)!.push(`${b.wickets}wkts, ${b.maidens}mdns (${b.overs}ov)`)
    }

    for (const f of result.fielding as ScrapedFielder[]) {
      const p = matchPlayer(f.name, players)
      if (!p) { addUnmatched(f.name, `field: ${f.catches}ct ${f.stumpings}st`); continue }
      const s = get(p.id)
      s.catches   = (s.catches   ?? 0) + f.catches
      s.stumpings = (s.stumpings ?? 0) + f.stumpings
      if (f.catches + f.stumpings > 0) sourcesMap.get(p.id)!.push(`${f.catches}ct, ${f.stumpings}st`)
    }

    for (const [id, partial] of playerMap.entries()) {
      const player = players.find(p => p.id === id)!
      matchRows.push({ player, partial, sources: sourcesMap.get(id) ?? [] })
    }

    // One row per unique normalised name.
    const unmatched: UnmatchedRow[] = Array.from(unmatchedDetails.entries()).map(
      ([key, details]) => ({ scrapedName: unmatchedDisplay.get(key)!, details })
    )

    return { matchRows, unmatched }
  })()

  async function handleApply() {
    if (!result) return
    setCreating(true)
    setCreateErr(null)

    // ── Auto-create unmatched players ────────────────────────────────────────
    // Collect unique scraped names that didn't match anyone in the roster.
    const unmatchedNames = new Set(unmatched.map(u => u.scrapedName))
    const newPlayers: Player[] = []

    for (const name of unmatchedNames) {
      try {
        const res  = await fetch('/api/admin/create-player', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name, matchId }),
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          setCreateErr(`Failed to create player "${name}": ${data.error ?? 'unknown error'}`)
          setCreating(false)
          return
        }
        newPlayers.push(data as Player)
      } catch {
        setCreateErr(`Network error while creating player "${name}".`)
        setCreating(false)
        return
      }
    }

    // ── Re-run matching with the extended player list ─────────────────────
    // Build matchRows again using the combined roster so new players are
    // included without duplicating the matching logic.
    const allPlayers   = [...players, ...newPlayers]
    const playerMap    = new Map<string, Partial<PlayerStats>>()
    const sourcesMap   = new Map<string, string[]>()

    const get = (id: string) => {
      if (!playerMap.has(id)) { playerMap.set(id, {}); sourcesMap.set(id, []) }
      return playerMap.get(id)!
    }

    for (const b of result.batting as ScrapedBatter[]) {
      const p = matchPlayer(b.name, allPlayers)
      if (!p) continue
      const s = get(p.id)
      s.runs = b.dnb ? 0 : b.runs;  s.balls = b.dnb ? 0 : b.balls
      s.fours = b.dnb ? 0 : b.fours; s.sixes = b.dnb ? 0 : b.sixes
      s.dnb = b.dnb
      sourcesMap.get(p.id)!.push(b.dnb ? 'DNB' : `${b.runs}(${b.balls}), ${b.fours}×4, ${b.sixes}×6`)
    }
    for (const b of result.bowling as ScrapedBowler[]) {
      const p = matchPlayer(b.name, allPlayers)
      if (!p) continue
      const s = get(p.id)
      s.wickets = b.wickets; s.maidens = b.maidens
      sourcesMap.get(p.id)!.push(`${b.wickets}wkts, ${b.maidens}mdns (${b.overs}ov)`)
    }
    for (const f of result.fielding as ScrapedFielder[]) {
      const p = matchPlayer(f.name, allPlayers)
      if (!p) continue
      const s = get(p.id)
      s.catches   = (s.catches   ?? 0) + f.catches
      s.stumpings = (s.stumpings ?? 0) + f.stumpings
      if (f.catches + f.stumpings > 0) sourcesMap.get(p.id)!.push(`${f.catches}ct, ${f.stumpings}st`)
    }

    const fullMatchRows: MatchRow[] = []
    for (const [id, partial] of playerMap.entries()) {
      const player = allPlayers.find(p => p.id === id)!
      fullMatchRows.push({ player, partial, sources: sourcesMap.get(id) ?? [] })
    }

    setCreating(false)
    onApply(fullMatchRows, newPlayers)
    setApplied(true)
  }

  // ── Collapsed trigger button ───────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#262162]/30 text-sm font-medium text-[#262162] bg-[#eeedf8] hover:bg-[#dddcf5] transition-colors"
      >
        <span>🏏</span> Import from Play-Cricket
      </button>
    )
  }

  const busy = urlBusy || pdfBusy || creating
  const activeErr = tab === 'url' ? urlErr : pdfErr

  return (
    <Card className="border-[#262162]/20 bg-[#eeedf8]/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-[#262162]">🏏 Import from Play-Cricket</CardTitle>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mt-2 p-1 bg-white rounded-lg border border-[#262162]/10 w-fit">
          <button
            onClick={() => switchTab('url')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              tab === 'url'
                ? 'bg-[#262162] text-white'
                : 'text-muted-foreground hover:text-[#262162]'
            }`}
          >
            🔗 Paste URL
          </button>
          <button
            onClick={() => switchTab('pdf')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              tab === 'pdf'
                ? 'bg-[#262162] text-white'
                : 'text-muted-foreground hover:text-[#262162]'
            }`}
          >
            📄 Upload PDF
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* ── URL tab ─────────────────────────────────────────────────────── */}
        {tab === 'url' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Paste the Play-Cricket results URL — any tab works (scorecard, summary, etc.).
            </p>
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://slough.play-cricket.com/game/…"
                className="flex-1 bg-white text-sm"
                onKeyDown={e => e.key === 'Enter' && handleFetchUrl()}
              />
              <Button
                onClick={handleFetchUrl}
                disabled={busy || !url.trim()}
                className="bg-[#262162] hover:bg-[#1a1748] shrink-0"
                size="sm"
              >
                {urlBusy ? 'Fetching…' : 'Fetch'}
              </Button>
            </div>
          </div>
        )}

        {/* ── PDF tab ─────────────────────────────────────────────────────── */}
        {tab === 'pdf' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Download the scorecard PDF from Play-Cricket then upload it here.
              The PDF must be text-based (not a scanned image).
            </p>

            {/* Drop zone */}
            <label
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center justify-center gap-2 w-full h-28 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                dragOver
                  ? 'border-[#262162] bg-[#eeedf8]'
                  : 'border-[#262162]/30 bg-white hover:border-[#262162]/60 hover:bg-[#eeedf8]/40'
              }`}
            >
              <input type="file" accept=".pdf,application/pdf" className="sr-only" onChange={onFileInput} />
              {pdfBusy ? (
                <p className="text-sm text-[#262162] font-medium">Parsing PDF…</p>
              ) : pdfFile && !pdfErr ? (
                <>
                  <span className="text-2xl">📄</span>
                  <p className="text-xs text-[#262162] font-medium">{pdfFile.name}</p>
                  <p className="text-[11px] text-muted-foreground">Click or drop to replace</p>
                </>
              ) : (
                <>
                  <span className="text-2xl">⬆️</span>
                  <p className="text-sm font-medium text-[#262162]">Drop PDF here or click to browse</p>
                  <p className="text-[11px] text-muted-foreground">Play-Cricket scorecard PDF, max 10 MB</p>
                </>
              )}
            </label>
          </div>
        )}

        {/* Error */}
        {activeErr && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            {activeErr}
          </div>
        )}

        {/* Warnings */}
        {result?.warnings && result.warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-0.5">
            {result.warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-800">⚠ {w}</p>
            ))}
          </div>
        )}

        {/* ── Preview (shared) ────────────────────────────────────────────── */}
        {result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[#262162]">
                {result.sloughTeamLabel}
                <span className="text-muted-foreground font-normal ml-2 text-xs">— {matchRows.length} players matched</span>
              </p>
              {unmatched.length > 0 && (
                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs">
                  {unmatched.length} unmatched
                </Badge>
              )}
            </div>

            {matchRows.length > 0 && (
              <div className="rounded-lg border bg-white overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Player</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Stats to import</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {matchRows.map(({ player, sources }) => (
                      <tr key={player.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{player.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{sources.join(' · ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {unmatched.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-semibold text-amber-800 mb-1">
                  Not matched to your player list — enter manually:
                </p>
                <div className="space-y-0.5">
                  {unmatched.map((u, i) => (
                    <p key={i} className="text-xs text-amber-700">
                      <span className="font-medium">{u.scrapedName}</span>
                      <span className="ml-2 text-amber-600">({u.details.join(', ')})</span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            {createErr && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
                {createErr}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                onClick={handleApply}
                disabled={matchRows.length === 0 && unmatched.length === 0 || applied || creating}
                className={applied ? 'bg-green-600' : 'bg-[#262162] hover:bg-[#1a1748]'}
                size="sm"
              >
                {creating
                  ? `Creating ${unmatched.length} player${unmatched.length !== 1 ? 's' : ''}…`
                  : applied
                    ? '✓ Applied to form'
                    : unmatched.length > 0
                      ? `Apply & create ${unmatched.length} new player${unmatched.length !== 1 ? 's' : ''}`
                      : `Apply ${matchRows.length} players to form`
                }
              </Button>
              {applied && (
                <p className="text-xs text-green-700">Stats pre-filled — review below, then save as normal.</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function StatsForm({ matchId, players, existingPerfs, matchStatus }: StatsFormProps) {
  const router = useRouter()

  // localPlayers grows when the import panel auto-creates unmatched players.
  const [localPlayers, setLocalPlayers] = useState<Player[]>(players)

  const [stats, setStats] = useState<Record<string, PlayerStats>>(
    () => Object.fromEntries(players.map((p) => [p.id, defaultStats(existingPerfs[p.id])]))
  )
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  function handleImport(rows: MatchRow[], newPlayers: Player[]) {
    // Add newly created players to the roster and initialise their stats.
    if (newPlayers.length > 0) {
      setLocalPlayers(prev => [...prev, ...newPlayers])
      setStats(prev => {
        const next = { ...prev }
        for (const p of newPlayers) {
          if (!next[p.id]) next[p.id] = defaultStats()
        }
        return next
      })
    }

    // Apply scraped stats (works for both pre-existing and newly created players).
    setStats(prev => {
      const next = { ...prev }
      for (const { player, partial } of rows) {
        if (next[player.id]) {
          next[player.id] = { ...next[player.id], ...partial }
        }
      }
      return next
    })
  }

  function update(playerId: string, field: keyof PlayerStats, value: string | boolean) {
    setStats((prev) => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        [field]: typeof value === 'boolean' ? value : NUM(value as string),
      },
    }))
  }

  function previewPoints(s: PlayerStats) {
    return computeBasePoints({
      runs_scored: s.runs, balls_faced: s.balls, fours: s.fours, sixes: s.sixes,
      did_not_bat: s.dnb, wickets: s.wickets, catches: s.catches, stumpings: s.stumpings,
      run_outs: s.runOuts, dot_balls: s.dotBalls, maidens: s.maidens,
    })
  }

  async function handleSave() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const rows = localPlayers.map((p) => {
      const s = stats[p.id]
      return {
        match_id: matchId,
        player_id: p.id,
        runs_scored: s.dnb ? 0 : s.runs,
        balls_faced: s.dnb ? 0 : s.balls,
        fours: s.dnb ? 0 : s.fours,
        sixes: s.dnb ? 0 : s.sixes,
        did_not_bat: s.dnb,
        wickets: s.wickets,
        catches: s.catches,
        stumpings: s.stumpings,
        run_outs: s.runOuts,
        dot_balls: s.dotBalls,
        maidens: s.maidens,
      }
    })

    const { error: err } = await supabase
      .from('match_performances')
      .upsert(rows, { onConflict: 'match_id,player_id' })

    if (err) { setError(err.message); setLoading(false); return }

    // Mark match as completed
    await supabase.from('matches').update({
      status: 'completed',
      result: result.trim() || null,
    }).eq('id', matchId)

    // Sync fantasy points for all selections linked to this match
    await supabase.rpc('sync_fantasy_points')

    // Auto-adjust player credits based on performance vs match average
    await supabase.rpc('adjust_player_credits', { p_match_id: matchId })

    setSavedMessage('Stats saved, points calculated and credits updated!')
    setTimeout(() => setSavedMessage(null), 4000)
    router.refresh()
    setLoading(false)

    // Fire-and-forget notification generation (don't block UI)
    fetch('/api/notifications/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId }),
    }).catch(() => {/* ignore */})
  }

  const totalPoints = localPlayers.reduce((sum, p) => sum + previewPoints(stats[p.id] ?? defaultStats()), 0)

  return (
    <div className="space-y-6">
      {/* Play-Cricket import */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Enter stats manually or import from Play-Cricket.</p>
        <PlayCricketImportPanel matchId={matchId} players={localPlayers} onApply={handleImport} />
      </div>

      {/* Match result */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Match Result</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder='e.g. "Won by 45 runs" or "Lost by 3 wickets"'
            defaultValue={existingPerfs[Object.keys(existingPerfs)[0]] ? '' : ''}
          />
          <p className="text-xs text-muted-foreground mt-1">Optional — shown on match detail page</p>
        </CardContent>
      </Card>

      {/* Stats table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Player Statistics</CardTitle>
            <span className="text-sm text-muted-foreground">Preview total: {totalPoints} pts</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3 min-w-[140px]">Player</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">DNB</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">Runs</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">Balls</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">4s</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">6s</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">Wkts</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">Dots</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">Mdns</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">Ct</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">St</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-3">RO</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase px-4 py-3">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {localPlayers.map((player) => {
                  const s = stats[player.id] ?? defaultStats()
                  const pts = previewPoints(s)
                  return (
                    <tr key={player.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <p className="text-sm font-medium">{player.name}</p>
                        <Badge className={`text-xs mt-0.5 ${
                          player.role === 'batsman' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' :
                          player.role === 'bowler' ? 'bg-[#fceaea] text-[#b5211e] hover:bg-[#fceaea]' :
                          player.role === 'all_rounder' ? 'bg-[#eeedf8] text-[#262162] hover:bg-[#eeedf8]' :
                          'bg-[#fefde8] text-[#262162] hover:bg-[#fefde8]'
                        }`}>
                          {PLAYER_ROLE_LABELS[player.role]}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={s.dnb}
                          onChange={(e) => update(player.id, 'dnb', e.target.checked)}
                          className="rounded"
                        />
                      </td>
                      {(['runs','balls','fours','sixes'] as const).map((field) => (
                        <td key={field} className="px-2 py-2">
                          <Input
                            type="number"
                            value={s.dnb ? '' : s[field]}
                            onChange={(e) => update(player.id, field, e.target.value)}
                            disabled={s.dnb}
                            className="w-16 text-center p-1 h-8 text-sm"
                            min={0}
                          />
                        </td>
                      ))}
                      {(['wickets','dotBalls','maidens','catches','stumpings','runOuts'] as const).map((field) => (
                        <td key={field} className="px-2 py-2">
                          <Input
                            type="number"
                            value={s[field]}
                            onChange={(e) => update(player.id, field, e.target.value)}
                            className="w-16 text-center p-1 h-8 text-sm"
                            min={0}
                          />
                        </td>
                      ))}
                      <td className="px-4 py-2 text-right font-bold text-[#262162]">{pts}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">{error}</div>
      )}
      {savedMessage && (
        <div className="bg-[#eeedf8] border border-[#262162]/20 text-[#262162] text-sm px-3 py-2 rounded-md">{savedMessage}</div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Saving will mark this match as completed and calculate all fantasy points.
        </p>
        <Button onClick={handleSave} disabled={loading} size="lg">
          {loading ? 'Saving...' : 'Save Stats & Calculate Points'}
        </Button>
      </div>
    </div>
  )
}
