/**
 * Standalone debug script — no Next.js dependency.
 *
 * Fetches the Play-Cricket print page for match 7276987 and dumps
 * the raw HTML of the first 5 <tbody tr> elements in the Slough CC
 * batting table, so we can see the actual DOM structure.
 *
 * Run:
 *   node scripts/debug-scraper.ts
 *   (Node 23.6+ strips TypeScript natively; fallback: node --experimental-strip-types scripts/debug-scraper.ts)
 */

import { parse as parseHtml } from 'node-html-parser'

const PRINT_URL = 'https://slough.play-cricket.com/website/results/7276987/print'

console.log('Fetching:', PRINT_URL)

const res = await fetch(PRINT_URL, {
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
  console.error(`HTTP ${res.status} ${res.statusText}`)
  process.exit(1)
}

const html = await res.text()
console.log(`Fetched ${html.length} bytes\n`)

const root = parseHtml(html)

// ── Replicate the parsePrintPage element walk ────────────────────────────────

const elements = root.querySelectorAll('h1,h2,h3,h4,h5,h6,table')

let inSloughSection = false
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sloughBatTable: any = null

for (const el of elements) {
  const tag  = el.tagName?.toLowerCase() ?? ''
  const text = el.text.replace(/\s+/g, ' ').trim()

  if (/^h[1-6]$/.test(tag)) {
    const low = text.toLowerCase()

    if (/slough/i.test(text)) {
      inSloughSection = true
      console.log('[walk] → Slough section heading:', JSON.stringify(text))
      continue
    }

    // Sub-headings that don't break the section
    if (/\b(batting|bowling|innings|fall\s+of|extras?)\b/i.test(low)) continue

    // Any other substantial heading = new section
    if (text.length > 3) {
      if (inSloughSection) console.log('[walk] ← Leaving Slough section at heading:', JSON.stringify(text))
      inSloughSection = false
    }
    continue
  }

  if (tag === 'table') {
    const ths = el.querySelectorAll('th').map((th: { text: string }) => th.text.trim().toLowerCase())

    if (inSloughSection && !sloughBatTable) {
      const isBatting = ths.some((h: string) => h.includes('how out'))
      if (isBatting) {
        sloughBatTable = el
        console.log('[walk] ✓ Found Slough batting table\n')
        break
      } else {
        console.log('[walk] Table in Slough section (not batting), headers:', ths)
      }
    }
  }
}

// ── Inline parse test ────────────────────────────────────────────────────────

function cellText(el: { text: string } | undefined): string {
  if (!el) return ''
  return el.text.replace(/\s+/g, ' ').trim()
}
function toInt(s: string): number { return Math.max(0, parseInt(s, 10) || 0) }
function buildDismissal(howOut: string, bowlerCell: string): string {
  const h = howOut.trim().replace(/\s+/g, ' ')
  const b = bowlerCell.trim().replace(/\s+/g, ' ')
  const hLow = h.toLowerCase()
  if (/^did\s+not\s+bat$|^dnb$/i.test(hLow)) return 'did not bat'
  if (/^not\s+out$/i.test(hLow))             return 'not out'
  if (/^run\s*out/i.test(hLow))              return h
  if (/^ct\s*&\s*b\s+/i.test(b))            return b.replace(/^ct\s*&\s*b\s+/i, 'c and b ')
  if (/^lbw$/i.test(hLow))                  return b ? `lbw ${b}` : 'lbw'
  const ctM = h.match(/^ct\s+(.+)/i)
  if (ctM) return b ? `c ${ctM[1].trim()} ${b}` : `c ${ctM[1].trim()}`
  const stM = h.match(/^st\s+(.+)/i)
  if (stM) return b ? `st ${stM[1].trim()} ${b}` : `st ${stM[1].trim()}`
  if (!h && b) return b
  if (!h && !b) return 'not out'
  return [h, b].filter(Boolean).join(' ')
}

if (sloughBatTable) {
  const ths = sloughBatTable.querySelectorAll('th').map((th: { text: string }) => th.text.trim().toLowerCase())
  const idx = (c: string[]) => ths.findIndex((h: string) => c.some(x => h === x || h.includes(x)))
  const iName   = Math.max(0,  idx(['name','batsman','batter','player']))
  const iHowOut = Math.max(1,  idx(['how out','dismissal']))
  const iBowler = Math.max(2,  idx(['bowler']))
  const iRuns   = Math.max(3,  idx(['runs','r']))
  const iFours  = Math.max(4,  idx(['4s','4','fours']))
  const iSixes  = Math.max(5,  idx(['6s','6','sixes']))
  const iBalls  = Math.max(6,  idx(['balls','b','ball']))

  const parsed: { name: string; dismissal: string; runs: number; balls: number }[] = []
  for (const row of sloughBatTable.querySelectorAll('tr')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((row as any).querySelectorAll('th').length > 0) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tds = (row as any).querySelectorAll('td')
    if (tds.length < 3) continue
    const name = cellText(tds[iName])
    if (!name || name.length < 2) continue
    if (/^(extras?|total\b|fall\s+of|\d)/i.test(name)) continue
    const howOut = cellText(tds[iHowOut])
    const bowler = cellText(tds[iBowler])
    parsed.push({ name, dismissal: buildDismissal(howOut, bowler), runs: toInt(cellText(tds[iRuns])), balls: toInt(cellText(tds[iBalls])) })
  }

  console.log(`\n── Parsed ${parsed.length} batting rows ─────────────────────────────────────\n`)
  parsed.forEach(r =>
    console.log(` ${r.name.padEnd(22)} ${r.dismissal.padEnd(40)} ${r.runs}(${r.balls})`)
  )
}

// ── Report ───────────────────────────────────────────────────────────────────

if (!sloughBatTable) {
  console.error('\n✗ Slough batting table NOT found.')
  console.log('\nAll headings on the page:')
  root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h: { tagName: string; text: string }) => {
    console.log(' ', h.tagName, JSON.stringify(h.text.replace(/\s+/g, ' ').trim()))
  })
  console.log('\nAll table header rows:')
  root.querySelectorAll('table').forEach((t: { querySelectorAll: (s: string) => { text: string }[] }, i: number) => {
    const ths = t.querySelectorAll('th').map((th: { text: string }) => th.text.trim())
    if (ths.length) console.log(`  Table ${i}:`, ths)
  })
  process.exit(1)
}

// Headers
const headers = sloughBatTable.querySelectorAll('th').map((th: { text: string }) => th.text.trim())
console.log('Batting table <th> headers:', headers)

// tbody rows
const tbodyRows = sloughBatTable.querySelectorAll('tbody tr')
console.log(`tbody <tr> count: ${tbodyRows.length}`)

// Also check for rows directly inside <table> (no explicit <tbody>)
const allRows = sloughBatTable.querySelectorAll('tr')
console.log(`All <tr> count (including thead): ${allRows.length}`)

console.log('\n── First 5 <tbody tr> elements ─────────────────────────────────────\n')
if (tbodyRows.length === 0) {
  console.log('(no <tbody tr> found — trying all <tr> except first/header rows)')
  allRows.slice(1, 6).forEach((row: { outerHTML: string }, i: number) => {
    console.log(`--- tr[${i + 1}] ---`)
    console.log(row.outerHTML)
    console.log()
  })
} else {
  tbodyRows.slice(0, 5).forEach((row: { outerHTML: string }, i: number) => {
    console.log(`--- tbody tr[${i}] ---`)
    console.log(row.outerHTML)
    console.log()
  })
}
