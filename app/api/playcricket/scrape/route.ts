import { NextResponse } from 'next/server'
import { parse as parseHtml } from 'node-html-parser'

// ── Types returned to the client ──────────────────────────────────────────────

export interface ScrapedBatter {
  name: string
  runs: number
  balls: number
  fours: number
  sixes: number
  dismissal: string   // raw text e.g. "c Smith b Jones"
  dnb: boolean        // did not bat
}

export interface ScrapedBowler {
  name: string
  overs: string       // raw e.g. "8.3"
  maidens: number
  wickets: number
}

export interface ScrapedFielder {
  name: string        // as appears in dismissal text
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

function cellText(el: { text: string }): string {
  return el.text.replace(/\s+/g, ' ').trim()
}

/** True when a string plausibly looks like a player name (not "Extras", "Total", etc.) */
function looksLikePlayer(name: string): boolean {
  if (!name || name.length < 2) return false
  const low = name.toLowerCase()
  if (/^(extras?|total|fall of|wides?|no.?balls?|byes?|leg byes?)/.test(low)) return false
  if (/^\d/.test(name)) return false        // starts with a digit
  return true
}

// ── Play-Cricket HTML structure ────────────────────────────────────────────────
//
// A typical scorecard page has two main sections in order:
//   1) First innings — a batting table then a bowling table
//   2) Second innings — a batting table then a bowling table
//
// We identify which section belongs to "Slough" by looking for "Slough" in the
// nearest preceding heading.  If we can't detect it, we take the first section.
//
// Table header patterns:
//   Batting: first th contains "Batsman" / "Batter" / "Player"
//            and a th contains "R" or "Runs"
//   Bowling: first th contains "Bowler" / "Bowling" / "Player"
//            and a th contains "W" or "Wkts"

function parseScorecard(html: string): ScrapeResult {
  const root = parseHtml(html)
  const warnings: string[] = []

  // ── Match title ─────────────────────────────────────────────────────────────
  const matchTitle =
    root.querySelector('h1')?.text?.trim() ??
    root.querySelector('title')?.text?.trim() ??
    'Play-Cricket Scorecard'

  // ── Find all tables + their nearest preceding heading ───────────────────────
  interface TableBlock {
    heading: string
    table: ReturnType<typeof root.querySelector>
    isBatting: boolean
    isBowling: boolean
  }

  const blocks: TableBlock[] = []

  const allTables = root.querySelectorAll('table')
  for (const table of allTables) {
    // Walk up/backward siblings to find the nearest h2/h3/h4
    let heading = ''
    let el = table.previousElementSibling
    let steps = 0
    while (el && steps < 8) {
      const tag = el.tagName?.toLowerCase() ?? ''
      if (/^h[1-6]$/.test(tag)) { heading = el.text.trim(); break }
      el = el.previousElementSibling
      steps++
    }
    // Also check the parent's preceding sibling headings
    if (!heading) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parent: any = table.parentNode
      let depth = 0
      while (parent && depth < 4) {
        let sib = parent.previousElementSibling
        let ss = 0
        while (sib && ss < 5) {
          const tag = sib.tagName?.toLowerCase() ?? ''
          if (/^h[1-6]$/.test(tag)) { heading = sib.text.trim(); break }
          sib = sib.previousElementSibling
          ss++
        }
        if (heading) break
        parent = parent.parentNode
        depth++
      }
    }

    // Classify the table by its headers
    const ths = table.querySelectorAll('th').map(th => th.text.trim().toLowerCase())
    const firstTh = ths[0] ?? ''

    const looksLikeBatting =
      (firstTh.includes('bat') || firstTh.includes('player') || firstTh.includes('name')) &&
      ths.some(h => h === 'r' || h === 'runs' || h.startsWith('run'))

    const looksLikeBowling =
      (firstTh.includes('bowl') || firstTh.includes('player') || firstTh.includes('name')) &&
      ths.some(h => h === 'w' || h === 'wkts' || h.startsWith('wicket'))

    if (looksLikeBatting || looksLikeBowling) {
      blocks.push({ heading, table, isBatting: looksLikeBatting, isBowling: looksLikeBowling })
    }
  }

  // ── Find which blocks belong to Slough CC ───────────────────────────────────
  // Strategy: prefer blocks whose heading contains "slough".
  // If nothing matches, fall back to the first batting block and its paired bowling block.
  const sloughBlocks = blocks.filter(b => /slough/i.test(b.heading))
  const usedBlocks = sloughBlocks.length > 0 ? sloughBlocks : blocks

  if (blocks.length === 0) {
    warnings.push('No scorecard tables detected on this page. Make sure the URL points to the scorecard tab.')
  } else if (sloughBlocks.length === 0) {
    warnings.push("Could not detect which innings belongs to Slough CC — using the first section. Verify the data is correct.")
  }

  const sloughTeamLabel = sloughBlocks[0]?.heading || blocks[0]?.heading || 'Slough CC'

  // ── Parse batting ────────────────────────────────────────────────────────────
  const batting: ScrapedBatter[] = []
  const battingBlock = usedBlocks.find(b => b.isBatting)

  if (battingBlock) {
    const ths = battingBlock.table!.querySelectorAll('th').map(th => th.text.trim().toLowerCase())

    // Column index detection
    const col = (candidates: string[]) =>
      ths.findIndex(h => candidates.some(c => h === c || h.includes(c)))

    const iName      = col(['batsman', 'batter', 'player', 'name'])
    const iDismissal = col(['dismissed', 'dismissal', 'how out', 'wicket', 'method'])
    const iRuns      = col(['r', 'runs'])
    const iBalls     = col(['b', 'balls', 'ball'])
    const iFours     = col(['4s', '4', 'fours'])
    const iSixes     = col(['6s', '6', 'sixes'])

    const rows = battingBlock.table!.querySelectorAll('tbody tr')
    for (const row of rows) {
      const tds = row.querySelectorAll('td')
      if (tds.length < 3) continue

      const name      = cellText(tds[iName >= 0 ? iName : 0])
      if (!looksLikePlayer(name)) continue

      const dismissal = iDismissal >= 0 ? cellText(tds[iDismissal]) : ''
      const dnb       = /did not bat|dnb|absent/i.test(dismissal)

      batting.push({
        name,
        dismissal,
        dnb,
        runs:  parseInt(cellText(tds[iRuns  >= 0 ? iRuns  : 2])) || 0,
        balls: parseInt(cellText(tds[iBalls >= 0 ? iBalls : 3])) || 0,
        fours: parseInt(cellText(tds[iFours >= 0 ? iFours : 4])) || 0,
        sixes: parseInt(cellText(tds[iSixes >= 0 ? iSixes : 5])) || 0,
      })
    }

    if (batting.length === 0) {
      warnings.push('Found a batting table but could not extract any player rows.')
    }
  } else {
    warnings.push('No batting table found for Slough CC.')
  }

  // ── Parse bowling ────────────────────────────────────────────────────────────
  const bowling: ScrapedBowler[] = []
  const bowlingBlock = usedBlocks.find(b => b.isBowling && !b.isBatting)
    ?? usedBlocks.find(b => b.isBowling)

  if (bowlingBlock) {
    const ths = bowlingBlock.table!.querySelectorAll('th').map(th => th.text.trim().toLowerCase())
    const col = (candidates: string[]) =>
      ths.findIndex(h => candidates.some(c => h === c || h.includes(c)))

    const iName    = col(['bowler', 'player', 'name'])
    const iOvers   = col(['o', 'ov', 'overs', 'over'])
    const iMaidens = col(['m', 'maiden', 'mdns'])
    const iWickets = col(['w', 'wkts', 'wicket'])

    const rows = bowlingBlock.table!.querySelectorAll('tbody tr')
    for (const row of rows) {
      const tds = row.querySelectorAll('td')
      if (tds.length < 3) continue

      const name = cellText(tds[iName >= 0 ? iName : 0])
      if (!looksLikePlayer(name)) continue

      bowling.push({
        name,
        overs:   cellText(tds[iOvers   >= 0 ? iOvers   : 1]),
        maidens: parseInt(cellText(tds[iMaidens >= 0 ? iMaidens : 2])) || 0,
        wickets: parseInt(cellText(tds[iWickets >= 0 ? iWickets : 4])) || 0,
      })
    }

    if (bowling.length === 0) {
      warnings.push('Found a bowling table but could not extract any player rows.')
    }
  } else {
    warnings.push('No bowling table found for Slough CC.')
  }

  // ── Extract fielding from dismissal text ─────────────────────────────────────
  // Patterns:
  //   "c FielderName b BowlerName"   → catch for FielderName
  //   "c and b BowlerName"           → caught & bowled (no separate fielder)
  //   "st FielderName b BowlerName"  → stumping for FielderName
  const fielderMap: Record<string, ScrapedFielder> = {}
  const getFielder = (raw: string) => {
    const k = raw.toLowerCase()
    if (!fielderMap[k]) fielderMap[k] = { name: raw, catches: 0, stumpings: 0 }
    return fielderMap[k]
  }

  for (const row of batting) {
    const d = row.dismissal

    // Catch: "c Fielder b Bowler" — excludes "c and b" / "c & b"
    const catchM = d.match(/^c\s+(?!and\b|&\b)(.+?)\s+b\s+.+/i)
    if (catchM) getFielder(catchM[1].trim()).catches++

    // Stumping: "st Fielder b Bowler"
    const stumpM = d.match(/^st\s+(.+?)\s+b\s+.+/i)
    if (stumpM) getFielder(stumpM[1].trim()).stumpings++
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

  let html: string
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      // 15-second timeout
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Play-Cricket returned HTTP ${res.status}. Check the URL and try again.` },
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
    const result = parseScorecard(html)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Parse error'
    return NextResponse.json({ error: `Failed to parse scorecard: ${msg}` }, { status: 500 })
  }
}
