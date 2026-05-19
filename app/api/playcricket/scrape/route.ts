import { NextResponse } from 'next/server'

// ── Types returned to the client ──────────────────────────────────────────────

export interface ScrapedBatter {
  name: string
  runs: number
  balls: number
  fours: number
  sixes: number
  dismissal: string   // reconstructed e.g. "c Smith b Jones"
  dnb: boolean        // did not bat
}

export interface ScrapedBowler {
  name: string
  overs: string       // raw e.g. "8.3"
  maidens: number
  wickets: number
}

export interface ScrapedFielder {
  name: string        // as extracted from bat rows
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

// ── Play-Cricket API v2 response types ────────────────────────────────────────

interface PCBatRow {
  batsman_name: string
  how_out: string          // "caught" | "bowled" | "lbw" | "stumped" | "run out" | "not out" | "did not bat" | ...
  fielder_name?: string
  bowler_name?: string
  runs: string | number
  balls: string | number
  fours: string | number
  sixes: string | number
  position?: number | string
}

interface PCBowlRow {
  bowler_name: string
  overs: string | number
  maidens: string | number
  wickets: string | number
  runs_conceded?: string | number
  no_balls?: string | number
  wides?: string | number
}

interface PCInnings {
  team_batting_id?: string
  team_batting_name?: string
  team_bowling_id?: string
  team_bowling_name?: string
  innings_number?: number | string
  runs?: string | number
  wickets?: string | number
  overs?: string | number
  bat?: PCBatRow[]
  bowl?: PCBowlRow[]
}

interface PCMatchDetail {
  id?: number | string
  title?: string
  description?: string          // often "Home v Away"
  home_team_name?: string
  away_team_name?: string
  home_club_name?: string
  away_club_name?: string
  innings?: PCInnings[]
}

interface PCApiResponse {
  match_details?: PCMatchDetail[]
  error?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the numeric match ID from any Play-Cricket results URL. */
function extractMatchId(url: string): string | null {
  // Handles: /results/12345, /results/12345/scorecard, /game/12345, /match/12345, etc.
  const m = url.match(/\/(?:results|game|match)\/(\d+)/i)
  return m ? m[1] : null
}

/** Reconstruct a human-readable dismissal string from Play-Cricket API fields. */
function buildDismissal(howOut: string, fielderName?: string, bowlerName?: string): string {
  const h = (howOut ?? '').toLowerCase().trim()

  if (!h || h === 'not out')                     return 'not out'
  if (h === 'did not bat' || h === 'dnb')        return 'did not bat'
  if (h === 'absent' || h === 'absent hurt')     return 'absent'
  if (h === 'retired' || h === 'retired hurt')   return 'retired hurt'
  if (h === 'hit wicket')                        return bowlerName ? `hit wicket b ${bowlerName}` : 'hit wicket'
  if (h === 'obstructing the field')             return 'obstructing the field'

  if (h === 'bowled' || h === 'b')
    return bowlerName ? `b ${bowlerName}` : 'bowled'

  if (h === 'lbw' || h === 'leg before wicket')
    return bowlerName ? `lbw b ${bowlerName}` : 'lbw'

  if (h === 'caught' || h === 'c' || h === 'caught and bowled' || h === 'c and b' || h === 'c & b') {
    // "caught and bowled" — fielder is the same as the bowler
    if (h === 'caught and bowled' || h === 'c and b' || h === 'c & b') {
      return bowlerName ? `c and b ${bowlerName}` : 'caught and bowled'
    }
    if (fielderName && bowlerName) return `c ${fielderName} b ${bowlerName}`
    if (bowlerName)               return `c and b ${bowlerName}`
    return 'caught'
  }

  if (h === 'stumped' || h === 'st') {
    if (fielderName && bowlerName) return `st ${fielderName} b ${bowlerName}`
    if (bowlerName)               return `st b ${bowlerName}`
    return 'stumped'
  }

  if (h === 'run out' || h === 'run-out') {
    return fielderName ? `run out (${fielderName})` : 'run out'
  }

  // Fallback: return the raw value as-is
  return howOut
}

/** Convert API value (string or number) to integer, defaulting to 0. */
function toInt(v: string | number | undefined): number {
  return parseInt(String(v ?? 0), 10) || 0
}

// ── JSON parser ───────────────────────────────────────────────────────────────

function parseApiResponse(data: PCApiResponse): ScrapeResult {
  const warnings: string[] = []

  const detail = data.match_details?.[0]
  if (!detail) {
    warnings.push('No match details found in API response.')
    return { matchTitle: 'Unknown', sloughTeamLabel: 'Slough CC', batting: [], bowling: [], fielding: [], warnings }
  }

  const matchTitle =
    detail.description ||
    detail.title ||
    [detail.home_team_name, detail.away_team_name].filter(Boolean).join(' v ') ||
    'Play-Cricket Match'

  const innings: PCInnings[] = detail.innings ?? []

  if (innings.length === 0) {
    warnings.push('Scorecard has no innings data yet. The match may not have been scored.')
    return { matchTitle, sloughTeamLabel: 'Slough CC', batting: [], bowling: [], fielding: [], warnings }
  }

  // ── Identify Slough's batting innings ─────────────────────────────────────
  // Slough bat in the innings where team_batting_name contains "slough".
  const sloughBatInnings = innings.find(i => /slough/i.test(i.team_batting_name ?? ''))
  // Slough bowl in the innings where team_bowling_name contains "slough".
  const sloughBowlInnings = innings.find(i => /slough/i.test(i.team_bowling_name ?? ''))

  if (!sloughBatInnings && !sloughBowlInnings) {
    warnings.push(
      "Could not detect Slough CC in this scorecard. The team name in Play-Cricket may differ — verify the data below."
    )
  }

  const sloughTeamLabel =
    sloughBatInnings?.team_batting_name ??
    sloughBowlInnings?.team_bowling_name ??
    'Slough CC'

  // ── Parse batting ─────────────────────────────────────────────────────────
  const batting: ScrapedBatter[] = []

  if (sloughBatInnings?.bat && sloughBatInnings.bat.length > 0) {
    for (const row of sloughBatInnings.bat) {
      const name = (row.batsman_name ?? '').trim()
      if (!name) continue

      const dismissalRaw = (row.how_out ?? '').trim()
      const dismissal = buildDismissal(dismissalRaw, row.fielder_name?.trim(), row.bowler_name?.trim())
      const dnb = /^did not bat$|^dnb$|^absent/i.test(dismissalRaw)

      batting.push({
        name,
        dismissal,
        dnb,
        runs:  toInt(row.runs),
        balls: toInt(row.balls),
        fours: toInt(row.fours),
        sixes: toInt(row.sixes),
      })
    }

    if (batting.length === 0) {
      warnings.push('Batting innings found but contained no player rows.')
    }
  } else if (sloughBatInnings) {
    warnings.push('Slough CC batting innings found but bat[] array is empty — match may not be fully scored.')
  } else {
    warnings.push('No batting innings found for Slough CC.')
  }

  // ── Parse bowling ─────────────────────────────────────────────────────────
  const bowling: ScrapedBowler[] = []

  if (sloughBowlInnings?.bowl && sloughBowlInnings.bowl.length > 0) {
    for (const row of sloughBowlInnings.bowl) {
      const name = (row.bowler_name ?? '').trim()
      if (!name) continue

      bowling.push({
        name,
        overs:   String(row.overs ?? '0'),
        maidens: toInt(row.maidens),
        wickets: toInt(row.wickets),
      })
    }

    if (bowling.length === 0) {
      warnings.push('Bowling innings found but contained no player rows.')
    }
  } else if (sloughBowlInnings) {
    warnings.push('Slough CC bowling innings found but bowl[] array is empty — match may not be fully scored.')
  } else {
    warnings.push('No bowling innings found for Slough CC.')
  }

  // ── Derive fielding from bat rows (catches & stumpings by Slough fielders) ─
  // The opponents' batting innings is where Slough players field.
  // We find it as the innings where team_bowling_name contains "slough".
  const fielderMap: Record<string, ScrapedFielder> = {}
  const getFielder = (name: string) => {
    const k = name.toLowerCase()
    if (!fielderMap[k]) fielderMap[k] = { name, catches: 0, stumpings: 0 }
    return fielderMap[k]
  }

  if (sloughBowlInnings?.bat) {
    for (const row of sloughBowlInnings.bat) {
      const h = (row.how_out ?? '').toLowerCase().trim()
      const fielder = row.fielder_name?.trim()
      if (!fielder) continue

      if (h === 'caught' || h === 'c') {
        getFielder(fielder).catches++
      } else if (h === 'stumped' || h === 'st') {
        getFielder(fielder).stumpings++
      }
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

  // ── Extract match ID from the pasted URL ───────────────────────────────────
  const matchId = extractMatchId(url)
  if (!matchId) {
    return NextResponse.json(
      { error: 'Could not find a match ID in that URL. Expected a URL like play-cricket.com/results/1234567.' },
      { status: 400 }
    )
  }

  // ── Build the API v2 URL ───────────────────────────────────────────────────
  const apiToken = process.env.PLAY_CRICKET_API_TOKEN
  if (!apiToken) {
    return NextResponse.json(
      { error: 'PLAY_CRICKET_API_TOKEN is not configured on the server. Add it to .env.local.' },
      { status: 500 }
    )
  }

  const apiUrl = `https://play-cricket.com/api/v2/match_detail?match_id=${matchId}&sections=scorecard&api_token=${encodeURIComponent(apiToken)}`

  // ── Fetch from Play-Cricket API ────────────────────────────────────────────
  let data: PCApiResponse
  try {
    const res = await fetch(apiUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'FantasyCricket/1.0',
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (res.status === 401) {
      return NextResponse.json(
        { error: 'Play-Cricket API rejected the token (401). Check that PLAY_CRICKET_API_TOKEN is correct.' },
        { status: 400 }
      )
    }
    if (res.status === 404) {
      return NextResponse.json(
        { error: `Match ID ${matchId} not found on Play-Cricket (404). Verify the URL.` },
        { status: 400 }
      )
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `Play-Cricket API returned HTTP ${res.status}.` },
        { status: 400 }
      )
    }

    data = (await res.json()) as PCApiResponse

    if (data.error) {
      return NextResponse.json(
        { error: `Play-Cricket API error: ${data.error}` },
        { status: 400 }
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to reach Play-Cricket API: ${msg}` },
      { status: 500 }
    )
  }

  // ── Parse and return ───────────────────────────────────────────────────────
  try {
    const result = parseApiResponse(data)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Parse error'
    return NextResponse.json({ error: `Failed to parse scorecard: ${msg}` }, { status: 500 })
  }
}
