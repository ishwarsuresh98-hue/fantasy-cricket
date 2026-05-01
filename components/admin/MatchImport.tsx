'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Tries to identify which team is Slough CC and returns the other one as "opponent". */
function deriveOpponent(home: string, away: string): string {
  const isHome = /slough/i.test(home)
  const isAway = /slough/i.test(away)
  if (isHome) return away.trim()
  if (isAway) return home.trim()
  // Neither team name contains "Slough" — show full fixture so admin can verify
  return `${home.trim()} vs ${away.trim()}`
}

/** Combine a Date object (date part) with a time string or Date (time part). */
function combineDateTime(dateVal: unknown, timeVal: unknown): Date | null {
  let base: Date | null = null

  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    base = new Date(dateVal)
  } else if (typeof dateVal === 'string' && dateVal.trim()) {
    const parsed = new Date(dateVal.trim())
    if (!isNaN(parsed.getTime())) base = parsed
  } else if (typeof dateVal === 'number') {
    // Excel serial — already converted by SheetJS with cellDates:true, but handle the fallback
    base = new Date((dateVal - 25569) * 86400 * 1000)
  }

  if (!base) return null

  // Apply time component
  if (timeVal instanceof Date && !isNaN(timeVal.getTime())) {
    base.setHours(timeVal.getHours(), timeVal.getMinutes(), 0, 0)
  } else if (typeof timeVal === 'string' && timeVal.trim()) {
    const m = timeVal.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i)
    if (m) {
      let h = parseInt(m[1])
      const min = parseInt(m[2])
      const period = m[4]?.toLowerCase()
      if (period === 'pm' && h < 12) h += 12
      if (period === 'am' && h === 12) h = 0
      base.setHours(h, min, 0, 0)
    }
  } else if (typeof timeVal === 'number') {
    // Excel time fraction (e.g. 0.625 = 15:00)
    const totalMinutes = Math.round(timeVal * 24 * 60)
    base.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0)
  }

  return base
}

function formatPreviewDate(d: Date): string {
  return d.toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }) + ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedMatch {
  rowIndex: number
  opponent: string
  matchDate: Date | null
  venue: string
  fixtureType: string
  division: string
  fixtureId: string
  rawDate: string
  rawTime: string
  error?: string
}

interface Props {
  seasonId: string
  currentMatchCount: number   // so we can auto-number from here
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MatchImport({ seasonId, currentMatchCount }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName]       = useState<string | null>(null)
  const [parsed, setParsed]           = useState<ParsedMatch[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [importing, setImporting]     = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; skipped: number } | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const validRows   = parsed.filter((r) => !r.error)
  const invalidRows = parsed.filter((r) => r.error)

  // ── Parse file ──────────────────────────────────────────────────────────────
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setParsed([])
    setParseErrors([])
    setImportResult(null)
    setGlobalError(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array', cellDates: true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

        if (rows.length === 0) {
          setGlobalError('The spreadsheet appears to be empty.')
          return
        }

        const keys = Object.keys(rows[0])
        const errors: string[] = []

        function findCol(...candidates: string[]) {
          return keys.find((k) =>
            candidates.some((c) => k.trim().toLowerCase() === c.toLowerCase())
          )
        }

        const dateCol    = findCol('Date')
        const homeCol    = findCol('Home_Team', 'Home Team', 'Home')
        const awayCol    = findCol('Away_Team', 'Away Team', 'Away')
        const timeCol    = findCol('Start_Time', 'Start Time', 'Time', 'KO', 'Kickoff')
        const groundCol  = findCol('Ground', 'Venue', 'Ground Name')
        const typeCol    = findCol('Fixture_Type', 'Fixture Type', 'Type')
        const divCol     = findCol('Division_or_Cup', 'Division or Cup', 'Division', 'Cup', 'Competition')
        const idCol      = findCol('Fixture_ID', 'Fixture ID', 'ID', 'FixtureID')

        if (!dateCol)  errors.push('Could not find a "Date" column.')
        if (!homeCol)  errors.push('Could not find a "Home_Team" column.')
        if (!awayCol)  errors.push('Could not find an "Away_Team" column.')

        if (errors.length > 0) { setParseErrors(errors); return }

        const matches: ParsedMatch[] = rows.map((row, idx) => {
          const rowNum   = idx + 2
          const rawDate  = String(row[dateCol!] ?? '').trim()
          const rawTime  = timeCol ? String(row[timeCol] ?? '').trim() : ''
          const rawHome  = String(row[homeCol!] ?? '').trim()
          const rawAway  = String(row[awayCol!] ?? '').trim()
          const venue    = groundCol  ? String(row[groundCol]  ?? '').trim() : ''
          const ftType   = typeCol    ? String(row[typeCol]    ?? '').trim() : ''
          const division = divCol     ? String(row[divCol]     ?? '').trim() : ''
          const fixId    = idCol      ? String(row[idCol]      ?? '').trim() : ''

          const m: ParsedMatch = {
            rowIndex: rowNum,
            opponent: '',
            matchDate: null,
            venue,
            fixtureType: ftType,
            division,
            fixtureId: fixId,
            rawDate,
            rawTime,
          }

          if (!rawHome && !rawAway) {
            m.error = 'Missing team names'
            return m
          }

          m.opponent = deriveOpponent(rawHome, rawAway)

          const combined = combineDateTime(row[dateCol!], timeCol ? row[timeCol] : '')
          if (!combined) {
            m.error = `Cannot parse date "${rawDate}"`
          } else {
            m.matchDate = combined
          }

          return m
        })

        setParsed(matches)
        setParseErrors(errors)
      } catch (err) {
        setGlobalError(`Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // ── Import ──────────────────────────────────────────────────────────────────
  async function handleImport() {
    if (validRows.length === 0) return
    setImporting(true)
    setGlobalError(null)

    const supabase = createClient()

    // Get the actual current max match_number from DB right before inserting
    // (avoids conflicts if another admin added matches since page load)
    const { data: existing } = await supabase
      .from('matches')
      .select('match_number')
      .eq('season_id', seasonId)
      .order('match_number', { ascending: false })
      .limit(1)
      .single()

    let nextNumber = (existing?.match_number ?? currentMatchCount) + 1

    const rows = validRows.map((m) => ({
      season_id:    seasonId,
      match_number: nextNumber++,
      opponent:     m.opponent,
      match_date:   m.matchDate!.toISOString(),
      venue:        m.venue || null,
      status:       'upcoming',
    }))

    // Insert in batches of 50
    const BATCH = 50
    let inserted = 0
    let skipped  = 0

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const { data, error } = await supabase
        .from('matches')
        .insert(batch)
        .select('id')

      if (error) {
        skipped += batch.length
      } else {
        inserted += data?.length ?? 0
        skipped  += batch.length - (data?.length ?? 0)
      }
    }

    setImporting(false)
    setImportResult({ success: inserted, skipped })
    setParsed([])
    setFileName(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function reset() {
    setParsed([])
    setParseErrors([])
    setFileName(null)
    setImportResult(null)
    setGlobalError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Format guide */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Expected Excel Format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Your <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">.xlsx</code> file must contain these columns (exact names, case-insensitive):
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Date', 'Home_Team', 'Away_Team', 'Start_Time', 'Ground', 'Fixture_Type', 'Division_or_Cup', 'Fixture_ID'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-3 py-2 whitespace-nowrap">01/06/2025</td>
                  <td className="px-3 py-2 whitespace-nowrap">Slough CC</td>
                  <td className="px-3 py-2 whitespace-nowrap">Thames Valley</td>
                  <td className="px-3 py-2">14:00</td>
                  <td className="px-3 py-2 whitespace-nowrap">Slough Ground</td>
                  <td className="px-3 py-2">League</td>
                  <td className="px-3 py-2">Division 1</td>
                  <td className="px-3 py-2">12345</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div>
              <p className="font-semibold text-gray-700 mb-1">Required columns</p>
              <ul className="space-y-0.5">
                <li><strong>Date</strong> — match date (any Excel date format)</li>
                <li><strong>Home_Team</strong> — home team name</li>
                <li><strong>Away_Team</strong> — away team name</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">Optional columns</p>
              <ul className="space-y-0.5">
                <li><strong>Start_Time</strong> — e.g. 14:00 or 2:00 PM</li>
                <li><strong>Ground</strong> — stored as venue</li>
                <li><strong>Fixture_Type / Division_or_Cup</strong> — shown in preview only</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-muted-foreground bg-[#eeedf8] rounded-lg px-3 py-2">
            💡 <strong>Opponent auto-detection:</strong> if one team name contains "Slough" the other team is used as the opponent.
            Otherwise both names are stored as "<em>Home vs Away</em>" so you can edit afterwards.
          </p>
        </CardContent>
      </Card>

      {/* Success */}
      {importResult && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-start gap-3">
              <span className="text-3xl">✅</span>
              <div>
                <p className="font-bold text-green-800 text-lg">
                  {importResult.success} match{importResult.success !== 1 ? 'es' : ''} imported successfully!
                </p>
                {importResult.skipped > 0 && (
                  <p className="text-sm text-green-700 mt-0.5">
                    {importResult.skipped} row{importResult.skipped !== 1 ? 's' : ''} skipped (duplicates or errors).
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    className="bg-[#262162] hover:bg-[#1a1748]"
                    onClick={() => router.push('/admin/matches')}
                  >
                    View Matches
                  </Button>
                  <Button size="sm" variant="outline" onClick={reset}>
                    Import More
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload */}
      {!importResult && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Upload File</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label
              htmlFor="match-xlsx-upload"
              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-[#262162] hover:bg-[#eeedf8]/30 transition-colors"
            >
              <span className="text-3xl mb-2">📂</span>
              <span className="text-sm font-medium text-gray-700">
                {fileName ?? 'Click to choose an .xlsx file'}
              </span>
              <span className="text-xs text-muted-foreground mt-0.5">Excel files only</span>
              <input
                id="match-xlsx-upload"
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFile}
              />
            </label>

            {globalError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">
                {globalError}
              </div>
            )}
            {parseErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md space-y-1">
                {parseErrors.map((e, i) => <p key={i}>• {e}</p>)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {parsed.length > 0 && !importResult && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">
                Preview — {parsed.length} row{parsed.length !== 1 ? 's' : ''} found
              </CardTitle>
              <div className="flex gap-2 text-sm">
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{validRows.length} valid</Badge>
                {invalidRows.length > 0 && (
                  <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{invalidRows.length} with errors</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">#</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Date &amp; Time</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Opponent</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Venue</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsed.map((m, i) => (
                    <tr key={m.rowIndex} className={m.error ? 'bg-red-50' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.rowIndex}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {m.matchDate
                          ? <span className="font-medium text-xs">{formatPreviewDate(m.matchDate)}</span>
                          : <span className="text-red-500 text-xs italic">{m.rawDate} {m.rawTime}</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 font-medium max-w-[180px] truncate">
                        {m.opponent || <span className="text-red-400 italic text-xs">missing</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[140px] truncate">
                        {m.venue || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {(m.fixtureType || m.division) ? (
                          <span className="text-xs text-muted-foreground">
                            {[m.fixtureType, m.division].filter(Boolean).join(' · ')}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {m.error
                          ? <span className="text-xs text-red-600">⚠ {m.error}</span>
                          : <span className="text-xs text-green-600 font-medium">✓ Ready</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {invalidRows.length > 0 && (
              <div className="px-4 py-3 border-t bg-amber-50 text-xs text-amber-800">
                ⚠ Rows with errors will be <strong>skipped</strong>. Fix them in your spreadsheet and re-upload, or proceed to import the {validRows.length} valid rows.
              </div>
            )}

            <div className="px-4 py-4 border-t flex items-center justify-between gap-3 flex-wrap">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button
                onClick={handleImport}
                disabled={validRows.length === 0 || importing}
                className="bg-[#262162] hover:bg-[#1a1748]"
              >
                {importing
                  ? 'Importing…'
                  : `Import ${validRows.length} Match${validRows.length !== 1 ? 'es' : ''}`
                }
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
