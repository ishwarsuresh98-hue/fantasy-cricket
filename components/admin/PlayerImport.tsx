'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { PlayerRole } from '@/types'

// ── Role mapping ──────────────────────────────────────────────────────────────
// Normalise any reasonable casing/spacing variant from the spreadsheet
const ROLE_MAP: Record<string, PlayerRole> = {
  'batsman':        'batsman',
  'bat':            'batsman',
  'batter':         'batsman',
  'bowler':         'bowler',
  'bowl':           'bowler',
  'allrounder':     'all_rounder',
  'all-rounder':    'all_rounder',
  'all rounder':    'all_rounder',
  'all_rounder':    'all_rounder',
  'ar':             'all_rounder',
  'wicketkeeper':   'wicket_keeper',
  'wicket-keeper':  'wicket_keeper',
  'wicket keeper':  'wicket_keeper',
  'wicket_keeper':  'wicket_keeper',
  'keeper':         'wicket_keeper',
  'wk':             'wicket_keeper',
}

function mapRole(raw: string): PlayerRole | null {
  return ROLE_MAP[raw.trim().toLowerCase()] ?? null
}

const ROLE_LABELS: Record<PlayerRole, string> = {
  batsman:        'Batsman',
  bowler:         'Bowler',
  all_rounder:    'All-Rounder',
  wicket_keeper:  'Wicket-Keeper',
}

const ROLE_COLORS: Record<PlayerRole, string> = {
  batsman:       'bg-blue-100 text-blue-700',
  bowler:        'bg-red-100 text-red-700',
  all_rounder:   'bg-purple-100 text-purple-700',
  wicket_keeper: 'bg-orange-100 text-orange-700',
}

interface ParsedPlayer {
  name: string
  role: PlayerRole
  price: number
  rawRole: string
  rowIndex: number
  error?: string
}

interface PlayerImportProps {
  seasonId: string
}

export default function PlayerImport({ seasonId }: PlayerImportProps) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedPlayer[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; skipped: number } | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const validRows    = parsed.filter((r) => !r.error)
  const invalidRows  = parsed.filter((r) => r.error)

  // ── Parse uploaded file ───────────────────────────────────────────────────
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
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

        if (rows.length === 0) {
          setGlobalError('The spreadsheet appears to be empty.')
          return
        }

        const players: ParsedPlayer[] = []
        const errors: string[] = []

        // Detect column names (case-insensitive)
        const firstRow = rows[0]
        const keys = Object.keys(firstRow)

        function findCol(candidates: string[]) {
          return keys.find((k) =>
            candidates.some((c) => k.trim().toLowerCase() === c.toLowerCase())
          )
        }

        const nameCol  = findCol(['Player Name', 'Name', 'Player'])
        const roleCol  = findCol(['Role', 'Position'])
        const creditCol = findCol(['Credit', 'Credits', 'Price', 'Cost'])

        if (!nameCol)   errors.push('Could not find a "Player Name" column.')
        if (!roleCol)   errors.push('Could not find a "Role" column.')
        if (!creditCol) errors.push('Could not find a "Credit" column.')

        if (!nameCol || !roleCol || !creditCol) {
          setParseErrors(errors)
          return
        }

        rows.forEach((row, idx) => {
          const rowNum = idx + 2  // 1-indexed, header on row 1
          const rawName   = String(row[nameCol] ?? '').trim()
          const rawRole   = String(row[roleCol] ?? '').trim()
          const rawCredit = String(row[creditCol] ?? '').trim()

          const player: ParsedPlayer = {
            name: rawName,
            role: 'batsman',   // placeholder
            price: 0,
            rawRole,
            rowIndex: rowNum,
          }

          if (!rawName) {
            player.error = 'Missing player name'
          } else {
            const mappedRole = mapRole(rawRole)
            if (!mappedRole) {
              player.error = `Unknown role "${rawRole}"`
            } else {
              player.role = mappedRole
            }

            const price = parseFloat(rawCredit)
            if (isNaN(price) || price < 6 || price > 11) {
              player.error = player.error
                ? player.error + '; credit must be 6.0–11.0'
                : `Credit "${rawCredit}" must be a number between 6.0 and 11.0`
            } else {
              player.price = price
            }
          }

          players.push(player)
        })

        setParsed(players)
        setParseErrors(errors)
      } catch (err) {
        setGlobalError(`Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // ── Import confirmed players ──────────────────────────────────────────────
  async function handleImport() {
    if (validRows.length === 0) return
    setImporting(true)
    setGlobalError(null)

    const supabase = createClient()
    const rows = validRows.map((p) => ({
      season_id: seasonId,
      name: p.name,
      role: p.role,
      price: p.price,
      is_active: true,
    }))

    // Insert in batches of 50 to stay within Supabase limits
    const BATCH = 50
    let inserted = 0
    let skipped  = 0

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const { data, error } = await supabase
        .from('players')
        .insert(batch)
        .select('id')

      if (error) {
        // Duplicate or constraint error — count as skipped
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Format guide */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Expected Excel Format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Your <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">.xlsx</code> file must have these column headers in the first row:
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Player Name</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Role</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-2">James Anderson</td>
                  <td className="px-4 py-2">Bowler</td>
                  <td className="px-4 py-2">8.5</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="px-4 py-2">Ravi Kumar</td>
                  <td className="px-4 py-2">All-Rounder</td>
                  <td className="px-4 py-2">9.0</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div>
              <p className="font-semibold text-gray-700 mb-1">Accepted role values</p>
              <ul className="space-y-0.5">
                <li>Batsman, Bat, Batter</li>
                <li>Bowler, Bowl</li>
                <li>All-Rounder, All Rounder, AR</li>
                <li>Wicket-Keeper, Wicket Keeper, Keeper, WK</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">Credit range</p>
              <p>Must be a number between <strong>6.0</strong> and <strong>11.0</strong></p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Success state */}
      {importResult && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-start gap-3">
              <span className="text-3xl">✅</span>
              <div>
                <p className="font-bold text-green-800 text-lg">
                  {importResult.success} player{importResult.success !== 1 ? 's' : ''} imported successfully!
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
                    onClick={() => router.push('/admin/players')}
                  >
                    View Players
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

      {/* File upload */}
      {!importResult && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Upload File</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label
              htmlFor="xlsx-upload"
              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-[#262162] hover:bg-[#eeedf8]/30 transition-colors"
            >
              <span className="text-3xl mb-2">📂</span>
              <span className="text-sm font-medium text-gray-700">
                {fileName ? fileName : 'Click to choose an .xlsx file'}
              </span>
              <span className="text-xs text-muted-foreground mt-0.5">Excel files only</span>
              <input
                id="xlsx-upload"
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

      {/* Preview table */}
      {parsed.length > 0 && !importResult && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">
                Preview — {parsed.length} row{parsed.length !== 1 ? 's' : ''} found
              </CardTitle>
              <div className="flex gap-2 text-sm">
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                  {validRows.length} valid
                </Badge>
                {invalidRows.length > 0 && (
                  <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                    {invalidRows.length} with errors
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Row</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Role</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Credit</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsed.map((p) => (
                    <tr
                      key={p.rowIndex}
                      className={p.error ? 'bg-red-50' : 'hover:bg-gray-50'}
                    >
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.rowIndex}</td>
                      <td className="px-4 py-2.5 font-medium">{p.name || <span className="text-red-400 italic">empty</span>}</td>
                      <td className="px-4 py-2.5">
                        {p.error ? (
                          <span className="text-xs text-muted-foreground">{p.rawRole}</span>
                        ) : (
                          <Badge className={`${ROLE_COLORS[p.role]} hover:${ROLE_COLORS[p.role]} text-xs`}>
                            {ROLE_LABELS[p.role]}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono">
                        {p.error && p.price === 0 ? '—' : p.price.toFixed(1)}
                      </td>
                      <td className="px-4 py-2.5">
                        {p.error ? (
                          <span className="text-xs text-red-600">⚠ {p.error}</span>
                        ) : (
                          <span className="text-xs text-green-600">✓ Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {invalidRows.length > 0 && (
              <div className="px-4 py-3 border-t bg-amber-50 text-xs text-amber-800">
                ⚠ Rows with errors will be <strong>skipped</strong>. Fix them in your spreadsheet and re-upload, or proceed to import only the valid rows.
              </div>
            )}

            <div className="px-4 py-4 border-t flex items-center justify-between gap-3 flex-wrap">
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={validRows.length === 0 || importing}
                className="bg-[#262162] hover:bg-[#1a1748]"
              >
                {importing
                  ? 'Importing…'
                  : `Import ${validRows.length} Player${validRows.length !== 1 ? 's' : ''}`
                }
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
