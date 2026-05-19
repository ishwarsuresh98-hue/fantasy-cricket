import { NextResponse } from 'next/server'
import type { ScrapeResult, ScrapedBatter, ScrapedBowler, ScrapedFielder } from '../scrape/route'

// ── pdf-parse dynamic import ───────────────────────────────────────────────────
// Dynamic import avoids pdf-parse's side-effect of trying to read test files on
// module load, which causes errors under Next.js App Router.
async function extractPdfText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import('pdf-parse') as any
  const parse = mod.default ?? mod
  const result = await parse(buffer)
  return result.text as string
}

// ── Row parsers ───────────────────────────────────────────────────────────────

/**
 * Try to parse a batting row from a single line of PDF text.
 *
 * Play-Cricket batting rows look like (column widths vary):
 *   A Patel        c Smith b Jones   45  67   5   1  67.2
 *   B Kumar        b Williams        23  34   2   0  67.6
 *   C Khan         not out           56  45   4   2  124.4
 *
 * Strategy: strip the trailing stats (R B 4s 6s [SR]) then split the
 * remainder into player name + dismissal using known dismissal keywords.
 */
function tryParseBatRow(line: string): ScrapedBatter | null {
  // Must end with 4 integers (R B 4s 6s), optionally followed by a decimal SR
  const m = line.match(
    /^(.+?)\s{1,}(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+\d+(?:\.\d+)?)?\s*$/
  )
  if (!m) return null

  const prefix = m[1].trim()
  const runs   = parseInt(m[2], 10)
  const balls  = parseInt(m[3], 10)
  const fours  = parseInt(m[4], 10)
  const sixes  = parseInt(m[5], 10)

  // Reject non-player rows (Extras, Total, Fall of wickets headers…)
  if (/^(extras?|total\b|fall\s+of|f\.o\.w|wides?|no.?balls?|byes?|leg\s+byes?)/i.test(prefix)) return null
  if (/^\d/.test(prefix)) return null   // starts with a digit

  // ── Split prefix into player name and dismissal ──
  // Dismissal always starts with one of a small set of keywords.
  const DISMISSAL_RE = /\s(c\s+and\s+b|c\s+&\s+b|c\s+|lbw\b|b\s+|st\s+|run\s+out|not\s+out|hit\s+wicket|retired|did\s+not\s+bat|absent)/i
  const splitAt = prefix.search(DISMISSAL_RE)

  let name: string
  let dismissal: string

  if (splitAt > 0) {
    name      = prefix.slice(0, splitAt).trim()
    dismissal = prefix.slice(splitAt).trim()
  } else {
    // Fallback: split on 2+ spaces (fixed-width column layout)
    const parts = prefix.split(/\s{2,}/)
    name      = parts[0].trim()
    dismissal = parts.slice(1).join('  ').trim()
  }

  if (!name || name.length < 2) return null

  const dnb = /did\s+not\s+bat|dnb|absent/i.test(dismissal) ||
               /did\s+not\s+bat|dnb|absent/i.test(prefix)

  return { name, dismissal: dismissal || '', dnb, runs, balls, fours, sixes }
}

/**
 * Try to parse a bowling row from a single line of PDF text.
 *
 * Play-Cricket bowling rows look like:
 *   B Singh    10    1   45    2    3    0
 *   Overs may be decimal: 8.3
 */
function tryParseBowlRow(line: string): ScrapedBowler | null {
  // Name  Overs  Maidens  Runs  Wickets [Wides NoBalls ...]
  const m = line.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+\d+)*\s*$/
  )
  if (!m) return null

  const name    = m[1].trim()
  const overs   = m[2]
  const maidens = parseInt(m[3], 10)
  const wickets = parseInt(m[5], 10)

  if (!name || name.length < 2) return null
  if (/^(extras?|total\b|fall|wides?|no.?balls?)/i.test(name)) return null
  if (/^\d/.test(name)) return null

  return { name, overs, maidens, wickets }
}

// ── Fielding from dismissal strings ──────────────────────────────────────────

function extractFieldingFromDismissal(
  dismissal: string,
  fielderMap: Record<string, ScrapedFielder>
) {
  const get = (raw: string) => {
    const k = raw.toLowerCase()
    if (!fielderMap[k]) fielderMap[k] = { name: raw, catches: 0, stumpings: 0 }
    return fielderMap[k]
  }

  // Catch: "c Fielder b Bowler" — excludes "c and b" / "c & b"
  const catchM = dismissal.match(/^c\s+(?!and\b|&\b)(.+?)\s+b\s+/i)
  if (catchM) get(catchM[1].trim()).catches++

  // Stumping: "st Fielder b Bowler"
  const stumpM = dismissal.match(/^st\s+(.+?)\s+b\s+/i)
  if (stumpM) get(stumpM[1].trim()).stumpings++
}

// ── Main PDF scorecard parser ─────────────────────────────────────────────────

/**
 * Parse plain text extracted from a Play-Cricket scorecard PDF.
 *
 * State machine:
 *   none → slough_bat  (when line contains "Slough" + "Innings"/"Batting")
 *   slough_bat → slough_bowl  (when line contains "Bowling"/"Analysis")
 *   slough_bat/slough_bowl → other_bat  (new innings header, no "Slough")
 *   other_bat → other_bowl  (bowling header after other team's batting)
 *
 * Within each state every line is speculatively parsed; lines that don't match
 * the row pattern are silently skipped.
 */
function parsePdfScorecard(rawText: string): ScrapeResult {
  const warnings: string[] = []

  // Normalise: collapse runs of spaces, preserve newlines
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.replace(/\t/g, '  '))  // tabs → spaces

  let matchTitle = ''
  let sloughTeamLabel = 'Slough CC'

  const batting:    ScrapedBatter[] = []
  const bowling:    ScrapedBowler[] = []
  const fielderMap: Record<string, ScrapedFielder> = {}

  type State = 'none' | 'slough_bat' | 'slough_bowl' | 'other_bat' | 'other_bowl'
  let state: State = 'none'

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    // ── Capture match title early ────────────────────────────────────────────
    if (!matchTitle && /\bvs?\.?\b/i.test(line) && line.length < 120 && !/^\d/.test(line)) {
      matchTitle = line
    }

    // ── Section transition: Slough batting ───────────────────────────────────
    if (/slough/i.test(line) && /(innings|batting)/i.test(line)) {
      state = 'slough_bat'
      // Extract just the team name portion (before "Innings"/"Batting")
      sloughTeamLabel =
        line.replace(/\s*(innings|batting\s*(analysis)?).*/i, '').trim() ||
        'Slough CC'
      continue
    }

    // ── Section transition: bowling after Slough batting ─────────────────────
    if (
      state === 'slough_bat' &&
      /\b(bowling(\s+analysis)?|analysis)\b/i.test(line) &&
      !/slough/i.test(line)
    ) {
      state = 'slough_bowl'
      continue
    }

    // ── Section transition: opposition batting ───────────────────────────────
    // Triggered by any innings/batting header that does NOT mention Slough.
    // Used to pick up fielding by parsing opposition dismissals.
    if (
      /\b(innings|batting)\b/i.test(line) &&
      !/slough/i.test(line) &&
      state !== 'none'
    ) {
      state = 'other_bat'
      continue
    }

    // ── Section transition: opposition bowling (stop fielding parse) ─────────
    if (
      state === 'other_bat' &&
      /\b(bowling(\s+analysis)?|analysis)\b/i.test(line) &&
      !/slough/i.test(line)
    ) {
      state = 'other_bowl'
      continue
    }

    // ── Skip table headers and summary lines ─────────────────────────────────
    if (
      /\b(batsman|batter|how\s+out|dismissal|bowler|overs?|maidens?|wickets?|fall\s+of|f\.o\.w)\b/i.test(line)
    ) continue

    // ── Handle "Did not bat: Name, Name" lines ───────────────────────────────
    if (/did\s+not\s+bat/i.test(line)) {
      if (state === 'slough_bat') {
        const names = line
          .replace(/did\s+not\s+bat\s*:?\s*/i, '')
          .split(/[,;]/)
          .map(n => n.trim())
          .filter(n => n.length > 1)
        for (const name of names) {
          batting.push({ name, runs: 0, balls: 0, fours: 0, sixes: 0, dismissal: 'did not bat', dnb: true })
        }
      }
      continue
    }

    // ── Skip totals / extras lines ───────────────────────────────────────────
    if (/^(extras?|total\b|\*?total)/i.test(line)) continue

    // ── Parse rows by state ───────────────────────────────────────────────────

    if (state === 'slough_bat') {
      const row = tryParseBatRow(line)
      if (row) batting.push(row)
      continue
    }

    if (state === 'slough_bowl') {
      const row = tryParseBowlRow(line)
      if (row) bowling.push(row)
      continue
    }

    if (state === 'other_bat') {
      // Parse opposition batting purely to extract fielding credits
      const row = tryParseBatRow(line)
      if (row?.dismissal) extractFieldingFromDismissal(row.dismissal, fielderMap)
      continue
    }
  }

  // ── Warnings ─────────────────────────────────────────────────────────────
  if (!matchTitle) matchTitle = 'Play-Cricket Scorecard'
  if (batting.length === 0) {
    warnings.push(
      'No batting data found for Slough CC. ' +
      'Make sure the PDF is a Play-Cricket scorecard and the file is not scanned/image-based.'
    )
  }
  if (bowling.length === 0) {
    warnings.push('No bowling data found for Slough CC.')
  }

  const fielding = Object.values(fielderMap).filter(f => f.catches + f.stumpings > 0)

  return { matchTitle, sloughTeamLabel, batting, bowling, fielding, warnings }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Expected a multipart/form-data request with a "file" field.' },
      { status: 400 }
    )
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file uploaded. Include a "file" field in the form data.' }, { status: 400 })
  }

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Please upload a PDF file.' }, { status: 400 })
  }

  const MAX_SIZE_MB = 10
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: `File is too large (max ${MAX_SIZE_MB} MB).` },
      { status: 400 }
    )
  }

  // Extract text
  let text: string
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    text = await extractPdfText(buffer)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to read PDF: ${msg}. Make sure the file is a text-based (not scanned) PDF.` },
      { status: 500 }
    )
  }

  if (!text || text.trim().length < 50) {
    return NextResponse.json(
      { error: 'Could not extract any text from this PDF. It may be a scanned image rather than a text-based PDF.' },
      { status: 400 }
    )
  }

  // Parse scorecard
  try {
    const result = parsePdfScorecard(text)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Parse error'
    return NextResponse.json({ error: `Failed to parse scorecard: ${msg}` }, { status: 500 })
  }
}
