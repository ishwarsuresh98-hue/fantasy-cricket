import { NextResponse } from 'next/server'
import { parse as parseHtml } from 'node-html-parser'

// ── Types returned to the client ──────────────────────────────────────────────

export interface ScrapedBatter {
  name: string
  runs: number
  balls: number
  fours: number
  sixes: number
  dismissal: string   // e.g. "c Smith b Jones", "not out"
  dnb: boolean
}

export interface ScrapedBowler {
  name: string
  overs: string       // raw e.g. "8.3"
  maidens: number
  wickets: number
}

export interface ScrapedFielder {
  name: string
  catches: number
  stumpings: number
}

export interface ScrapeResult {
  matchTitle: string
  sloughTeamLabel: string
  batting: ScrapedBatter[]
  bowling: ScrapedBowler[]
  fielding: ScrapedFielder[]
  warnings: string[]
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function cellText(el: { text: string } | undefined): string {
  if (!el) return ''
  return el.text.replace(/\s+/g, ' ').trim()
}

/** Convert a string or numeric cell value to a non-negative integer. */
function toInt(raw: string): number {
  return Math.max(0, parseInt(raw, 10) || 0)
}

// ── URL normalisation ─────────────────────────────────────────────────────────

/**
 * Convert any Play-Cricket results URL to its /print equivalent.
 *
 *   …/website/results/7276987             → …/website/results/7276987/print
 *   …/website/results/7276987/scorecard   → …/website/results/7276987/print
 *   …/website/results/7276987/print       → unchanged
 */
function normaliseToPrint(raw: string): string {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return raw
  }

  const KNOWN_TABS = [
    'scorecard', 'summary', 'ball-by-ball', 'statistics',
    'teams', 'overview', 'print',
  ]

  const parts = u.pathname.replace(/\/$/, '').split('/')
  const last  = parts[parts.length - 1]

  if (KNOWN_TABS.includes(last)) {
    // Replace any existing tab (including /print itself — idempotent)
    parts[parts.length - 1] = 'print'
  } else if (/^\d+$/.test(last)) {
    // Bare numeric match ID — append /print
    parts.push('print')
  }
  // Any other form: leave the path as-is and let the fetch fail naturally

  u.pathname = parts.join('/')
  return u.toString()
}

// ── Dismissal reconstruction ───────────────────────────────────────────────────
//
// The print page uses this two-column layout (confirmed from live HTML):
//
//   How Out col          Bowler col                Meaning
//   ─────────────────    ────────────────────────  ──────────────────────────
//   (empty)              ct & b  Oliver Wright     caught and bowled
//   ct  David Eaton      b  Oliver Wright          caught
//   st  David Eaton      b  Oliver Wright          stumped
//   lbw                  b  Oliver Wright          leg before wicket
//   run out (K. Coyne)   (empty)                   run out
//   (empty)              b  Oliver Wright           bowled (how-out cell blank)
//   (empty)              (empty)                   not out
//   Did Not Bat          (empty)                   did not bat
//
// node-html-parser's .text already decodes &nbsp; → regular space.
// The Bowler column contains "b Name" — NOT a bare name.

function buildDismissal(howOut: string, bowler: string): string {
  // Collapse any residual non-breaking / double spaces left after entity decode
  const h = howOut.trim().replace(/\s+/g, ' ')
  const b = bowler.trim().replace(/\s+/g, ' ')
  const hLow = h.toLowerCase()

  // ── How Out cell is the authoritative source for these ──────────────────
  if (/^did\s+not\s+bat$|^dnb$/i.test(hLow)) return 'did not bat'
  if (/^absent/i.test(hLow))                  return 'absent'
  if (/^retired/i.test(hLow))                 return 'retired hurt'
  if (/^not\s+out$/i.test(hLow))              return 'not out'
  if (/^obstructing/i.test(hLow))             return 'obstructing the field'

  // run out — fielder name already embedded in How Out cell
  if (/^run\s*out/i.test(hLow)) return h   // e.g. "run out (Kieran Coyne)"

  // ── "ct & b BowlerName" lives entirely in the Bowler column ─────────────
  if (/^ct\s*&\s*b\s+/i.test(b))
    return b.replace(/^ct\s*&\s*b\s+/i, 'c and b ')

  // ── Standard dismissals: How Out + Bowler combined ───────────────────────
  // Bowler column is "b Name" — reuse it verbatim in the output string.

  // "lbw" in How Out; Bowler col = "b Name"
  if (/^lbw$/i.test(hLow)) return b ? `lbw ${b}` : 'lbw'

  // "ct FielderName" in How Out; Bowler col = "b BowlerName"
  const ctM = h.match(/^ct\s+(.+)/i)
  if (ctM) return b ? `c ${ctM[1].trim()} ${b}` : `c ${ctM[1].trim()}`

  // "st FielderName" in How Out; Bowler col = "b BowlerName"
  const stM = h.match(/^st\s+(.+)/i)
  if (stM) return b ? `st ${stM[1].trim()} ${b}` : `st ${stM[1].trim()}`

  // "hit wicket" in How Out; Bowler col = "b BowlerName"
  if (/^hit\s+wicket$/i.test(hLow)) return b ? `hit wicket ${b}` : 'hit wicket'

  // How Out empty, Bowler = "b Name" → bowled
  if (!h && b) return b

  // Both empty → not out
  if (!h && !b) return 'not out'

  // Fallback: concatenate whatever is present
  return [h, b].filter(Boolean).join(' ')
}

/**
 * Extract a Slough fielder's name and method from one opposition batting row.
 * howOut  = content of the "How Out" cell   (e.g. "ct David Eaton")
 * bowler  = content of the "Bowler"  cell   (e.g. "ct & b Oliver Wright")
 * Returns null when no named fielder is credited (bowled, lbw, run out, etc.).
 */
function extractFielder(
  howOut: string,
  bowler: string,
): { name: string; method: 'catch' | 'stumping' } | null {
  // "ct FielderName" in How Out
  const ctM = howOut.match(/^ct\s+(.+)/i)
  if (ctM) return { name: ctM[1].trim(), method: 'catch' }

  // "ct & b BowlerName" in Bowler col → the bowler took the catch themselves
  const cbM = bowler.match(/^ct\s*&\s*b\s+(.+)/i)
  if (cbM) return { name: cbM[1].trim(), method: 'catch' }

  // "st FielderName" in How Out
  const stM = howOut.match(/^st\s+(.+)/i)
  if (stM) return { name: stM[1].trim(), method: 'stumping' }

  return null
}

// ── HTML parser ───────────────────────────────────────────────────────────────
//
// The Play-Cricket /print page is server-rendered static HTML.  Its structure:
//
//   <h2> (or h3)  "Slough CC"  ← team heading
//     <h3>  "Batting"
//     <table>  cols: Name | How Out | Bowler | Runs | 4s | 6s | Balls
//     <h3>  "Bowling"
//     <table>  cols: Bowler | Overs | Maidens | Runs | Wickets | Wides | No Balls
//
//   <h2>  "Opponent CC"
//     <h3>  "Batting"
//     <table>  (same batting columns) ← parsed for Slough fielding only
//     …
//
// Strategy: walk all headings and tables in document order, track which "team
// section" we're in, and collect the right tables.

function parsePrintPage(html: string): ScrapeResult {
  const root = parseHtml(html)
  const warnings: string[] = []

  // Match title
  const matchTitle =
    root.querySelector('h1')?.text?.trim() ??
    root.querySelector('title')?.text?.trim() ??
    'Play-Cricket Scorecard'

  // ── Walk all headings + tables in document order ──────────────────────────
  // node-html-parser preserves source order inside querySelectorAll.
  const elements = root.querySelectorAll('h1,h2,h3,h4,h5,h6,table')

  type TableRole = 'batting' | 'bowling' | 'unknown'

  function classifyTable(el: typeof elements[number]): TableRole {
    const ths = el.querySelectorAll('th').map(th => th.text.trim().toLowerCase())
    if (ths.some(h => h.includes('how out') || h === 'how out')) return 'batting'
    if (ths.some(h => h.includes('wicket') || h.includes('wides') || h === 'w')) return 'bowling'
    // Fallback: a table whose first header looks like a name column and has
    // a "runs" column is likely batting; one with "overs" is likely bowling.
    if (ths.some(h => h.includes('run')) && ths.some(h => h === 'name' || h === 'batsman' || h === 'batter')) return 'batting'
    if (ths.some(h => h.includes('over') || h.includes('maiden'))) return 'bowling'
    return 'unknown'
  }

  // Section state
  let inSloughSection  = false
  let sloughTeamLabel  = 'Slough CC'
  let sloughBatTable:  typeof elements[number] | null = null
  let sloughBowlTable: typeof elements[number] | null = null
  let oppBatTable:     typeof elements[number] | null = null   // for fielding

  for (const el of elements) {
    const tag  = el.tagName?.toLowerCase() ?? ''
    const text = el.text.replace(/\s+/g, ' ').trim()

    if (/^h[1-6]$/.test(tag)) {
      const low = text.toLowerCase()

      if (/slough/i.test(text)) {
        // Enter Slough section
        inSloughSection = true
        sloughTeamLabel = text
        continue
      }

      // Sub-headings like "Batting" / "Bowling" / "Innings" don't end the section
      if (/\b(batting|bowling|innings|fall\s+of|extras?)\b/i.test(low)) continue

      // Any other substantial heading = new team section
      if (text.length > 3) {
        inSloughSection = false
      }
      continue
    }

    if (tag === 'table') {
      const role = classifyTable(el)
      if (role === 'unknown') continue

      if (inSloughSection) {
        if (role === 'batting'  && !sloughBatTable)  sloughBatTable  = el
        if (role === 'bowling'  && !sloughBowlTable) sloughBowlTable = el
      } else {
        // First opposition batting table — used for fielding
        if (role === 'batting' && !oppBatTable) oppBatTable = el
      }
    }
  }

  if (!sloughBatTable && !sloughBowlTable) {
    warnings.push(
      'Could not find a Slough CC section on this page. ' +
      'Make sure the URL is a Play-Cricket results page.'
    )
  }

  // ── Parse Slough batting ──────────────────────────────────────────────────
  const batting: ScrapedBatter[] = []

  if (sloughBatTable) {
    const ths = sloughBatTable
      .querySelectorAll('th')
      .map(th => th.text.trim().toLowerCase())

    const idx = (candidates: string[]) =>
      ths.findIndex(h => candidates.some(c => h === c || h.includes(c)))

    // Column positions — detect by header name, fall back to known print-page order.
    // Print page order: Name(0) | How Out(1) | Bowler(2) | Runs(3) | 4s(4) | 6s(5) | Balls(6)
    //
    // IMPORTANT: keep candidates unambiguous — short strings like 'r', 'b', '4', '6'
    // would substring-match earlier columns ('bowler'.includes('r') etc.) and resolve
    // to the wrong index.
    const iName   = idx(['name', 'batsman', 'batter', 'player']) !== -1 ? idx(['name', 'batsman', 'batter', 'player']) : 0
    const iHowOut = idx(['how out', 'how_out', 'dismissal'])      !== -1 ? idx(['how out', 'how_out', 'dismissal'])     : 1
    const iBowler = idx(['bowler'])                               !== -1 ? idx(['bowler'])                              : 2
    const iRuns   = idx(['runs'])                                 !== -1 ? idx(['runs'])                                : 3
    const iFours  = idx(['4s', 'fours'])                          !== -1 ? idx(['4s', 'fours'])                         : 4
    const iSixes  = idx(['6s', 'sixes'])                          !== -1 ? idx(['6s', 'sixes'])                         : 5
    const iBalls  = idx(['balls'])                                !== -1 ? idx(['balls'])                               : 6

    // Play-Cricket print page omits <tbody> — rows are direct children of <table>.
    // Player rows always have exactly 7 cells (Name|HowOut|Bowler|Runs|4s|6s|Balls).
    // Summary rows (Extras, Total, Wickets, footnote) use colspan and appear as ≤4 cells.
    // Run-out rows keep all 7 cells — Bowler is simply an empty <td>, no column shifting.
    for (const row of sloughBatTable.querySelectorAll('tr')) {
      if (row.querySelectorAll('th').length > 0) continue   // header row
      const tds = row.querySelectorAll('td')
      if (tds.length < 7) continue                          // summary / footnote rows

      // Strip captain (*) and wicket-keeper (†) symbols from the name cell.
      // node-html-parser decodes &dagger; → † before we ever see the text.
      const name = cellText(tds[iName]).replace(/[†*]/g, '').trim()
      if (!name || name.length < 2) continue
      if (/^(extras?|total\b|fall\s+of|\d)/i.test(name)) continue

      const howOut    = cellText(tds[iHowOut] ?? tds[1])
      const bowler    = cellText(tds[iBowler] ?? tds[2])
      const dismissal = buildDismissal(howOut, bowler)
      const dnb       = /did\s+not\s+bat|dnb|absent/i.test(dismissal)

      batting.push({
        name,
        dismissal,
        dnb,
        runs:  toInt(cellText(tds[iRuns]  ?? tds[3])),
        fours: toInt(cellText(tds[iFours] ?? tds[4])),
        sixes: toInt(cellText(tds[iSixes] ?? tds[5])),
        balls: toInt(cellText(tds[iBalls] ?? tds[6])),
      })
    }

    if (batting.length === 0)
      warnings.push('Found Slough CC batting table but could not extract any player rows.')
  } else {
    warnings.push('No batting table found for Slough CC.')
  }

  // ── Parse Slough bowling ──────────────────────────────────────────────────
  const bowling: ScrapedBowler[] = []

  if (sloughBowlTable) {
    const ths = sloughBowlTable
      .querySelectorAll('th')
      .map(th => th.text.trim().toLowerCase())

    const idx = (candidates: string[]) =>
      ths.findIndex(h => candidates.some(c => h === c || h.includes(c)))

    // Print page order: Bowler(0) | Overs(1) | Maidens(2) | Runs(3) | Wickets(4) | Wides(5) | No Balls(6)
    const iName    = idx(['bowler', 'name', 'player'])               !== -1
                       ? idx(['bowler', 'name', 'player'])             : 0
    const iOvers   = idx(['overs', 'o', 'ov'])                       !== -1
                       ? idx(['overs', 'o', 'ov'])                     : 1
    const iMaidens = idx(['maidens', 'mdns', 'm'])                   !== -1
                       ? idx(['maidens', 'mdns', 'm'])                 : 2
    const iWickets = idx(['wickets', 'wkts', 'w'])                   !== -1
                       ? idx(['wickets', 'wkts', 'w'])                 : 4

    // Same no-<tbody> fix as batting above.
    for (const row of sloughBowlTable.querySelectorAll('tr')) {
      if (row.querySelectorAll('th').length > 0) continue   // header row
      const tds = row.querySelectorAll('td')
      if (tds.length < 4) continue

      const name = cellText(tds[iName])
      if (!name || name.length < 2) continue
      if (/^(extras?|total\b|\d)/i.test(name)) continue

      bowling.push({
        name,
        overs:   cellText(tds[iOvers]   ?? tds[1]),
        maidens: toInt(cellText(tds[iMaidens] ?? tds[2])),
        wickets: toInt(cellText(tds[iWickets] ?? tds[4])),
      })
    }

    if (bowling.length === 0)
      warnings.push('Found Slough CC bowling table but could not extract any player rows.')
  } else {
    warnings.push('No bowling table found for Slough CC.')
  }

  // ── Extract Slough fielding from opposition batting table ─────────────────
  // In the opposition batting table the "Bowler" column is a Slough bowler and
  // the "How Out" column may name a Slough fielder (catches / stumpings).
  const fielderMap: Record<string, ScrapedFielder> = {}
  const getFielder = (raw: string) => {
    const k = raw.toLowerCase()
    if (!fielderMap[k]) fielderMap[k] = { name: raw, catches: 0, stumpings: 0 }
    return fielderMap[k]
  }

  if (oppBatTable) {
    const ths = oppBatTable
      .querySelectorAll('th')
      .map(th => th.text.trim().toLowerCase())
    const idx = (candidates: string[]) =>
      ths.findIndex(h => candidates.some(c => h === c || h.includes(c)))

    const iHowOut = idx(['how out', 'dismissal', 'how_out']) !== -1
                      ? idx(['how out', 'dismissal', 'how_out']) : 1

    // Same no-<tbody> fix.
    const iBowlerOpp = (() => {
      const t = oppBatTable.querySelectorAll('th').map((th: { text: string }) => th.text.trim().toLowerCase())
      const i = t.findIndex((h: string) => h === 'bowler' || h.includes('bowler'))
      return i !== -1 ? i : 2
    })()

    for (const row of oppBatTable.querySelectorAll('tr')) {
      if (row.querySelectorAll('th').length > 0) continue   // header row
      const tds = row.querySelectorAll('td')
      if (tds.length < 2) continue
      const howOut = cellText(tds[iHowOut] ?? tds[1])
      const bowler = cellText(tds[iBowlerOpp] ?? tds[2])
      const fielder = extractFielder(howOut, bowler)
      if (!fielder) continue
      if (fielder.method === 'catch')    getFielder(fielder.name).catches++
      if (fielder.method === 'stumping') getFielder(fielder.name).stumpings++
    }
  }

  const fielding = Object.values(fielderMap).filter(f => f.catches + f.stumpings > 0)

  return { matchTitle, sloughTeamLabel, batting, bowling, fielding, warnings }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const { url } = (await request.json()) as { url?: string }

  if (!url?.includes('play-cricket.com')) {
    return NextResponse.json(
      { error: 'Please provide a valid Play-Cricket URL (must contain play-cricket.com)' },
      { status: 400 }
    )
  }

  const printUrl = normaliseToPrint(url)

  let html: string
  try {
    const res = await fetch(printUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Play-Cricket returned HTTP ${res.status} for the print page. Check the URL and try again.` },
        { status: 400 }
      )
    }

    html = await res.text()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to fetch scorecard: ${msg}` },
      { status: 500 }
    )
  }

  try {
    const result = parsePrintPage(html)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Parse error'
    return NextResponse.json(
      { error: `Failed to parse scorecard: ${msg}` },
      { status: 500 }
    )
  }
}
