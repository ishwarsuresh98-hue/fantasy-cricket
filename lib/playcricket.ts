/**
 * Play Cricket API v2 client
 *
 * Env vars required:
 *   PLAY_CRICKET_API_KEY   — from your Play Cricket account portal
 *   PLAY_CRICKET_SITE_ID   — your club's site ID (found in the Play Cricket URL or admin portal)
 *
 * API base: https://play-cricket.com/api/v2
 */

const BASE    = 'https://play-cricket.com/api/v2'
const API_KEY = process.env.PLAY_CRICKET_API_KEY ?? ''
const SITE_ID = process.env.PLAY_CRICKET_SITE_ID ?? ''

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PCMatchSummary {
  id:                   string
  status:               string      // "Completed" | "Fix" | "Cancelled" | ...
  published:            string      // "Yes" | "No"
  home_club_id:         string
  home_club_name:       string
  home_team_id:         string
  home_team_name:       string
  away_club_id:         string
  away_club_name:       string
  away_team_id:         string
  away_team_name:       string
  ground_id:            string
  ground_name:          string
  match_date:           string      // e.g. "Sat, 01 Jun, 2024"
  match_time:           string
  result_description:   string
  league_name?:         string
  competition_name?:    string
  match_type?:          string
  season?:              string
}

export interface PCPlayerRecord {
  position:       string
  name:           string
  captain:        string            // "1" | "0"
  wicket_keeper:  string            // "1" | "0"
}

export interface PCBat {
  position:     string
  batsman_name: string
  how_out:      string
  fielder_name: string
  bowler_name:  string
  runs:         string
  fours:        string
  sixes:        string
  balls:        string
}

export interface PCBowl {
  position:    string
  bowler_name: string
  overs:       string    // e.g. "8.3" (8 overs 3 balls)
  maidens:     string
  runs:        string
  wides:       string
  no_balls:    string
  wickets:     string
}

export interface PCInnings {
  team_bowling_id:    string
  team_bowling_name:  string
  team_batting_id:    string
  team_batting_name:  string
  team_fielding_id:   string
  team_fielding_name: string
  bat:                PCBat[]
  bowl:               PCBowl[]
  fow?:               unknown[]
}

export interface PCMatchDetail {
  home_club_name:     string
  away_club_name:     string
  id:                 string
  home_club_id:       string
  home_team_id:       string
  home_team_name:     string
  away_club_id:       string
  away_team_id:       string
  away_team_name:     string
  ground_name:        string
  match_date:         string
  /** Human-readable result on the detail endpoint: "Won by 8 wickets", "Lost by 25 runs", etc.
   *  (On the /matches summary endpoint the same field name carries league-points info instead.) */
  result_description: string
  /** Numeric result code: "1" = home win, "2" = away win, "3" = tie/draw, "4" = no result.
   *  Present on the match_detail endpoint; may be absent on older matches. */
  match_result?:      string
  players?: {
    home_team?: PCPlayerRecord[]
    away_team?: PCPlayerRecord[]
  }
  innings?: PCInnings[]
}

export interface PCSiteInfo {
  id:        string
  name:      string
  long_name: string
  url:       string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiUrl(endpoint: string, params: Record<string, string>): string {
  if (!API_KEY) throw new Error('PLAY_CRICKET_API_KEY is not set')
  const qs = new URLSearchParams({ ...params, api_token: API_KEY })
  return `${BASE}/${endpoint}.json?${qs.toString()}`
}

async function apiFetch<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = apiUrl(endpoint, params)
  const res  = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'fantasy-cricket-app/1.0' },
    signal:  AbortSignal.timeout(20_000),
    cache:   'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Play Cricket API /${endpoint}: HTTP ${res.status} — ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

/**
 * Convert an overs string ("8.3") to total balls bowled.
 * 8.3 = 8 complete overs + 3 balls = 51 balls.
 */
export function oversToBalls(overs: string): number {
  const [whole, part] = overs.split('.')
  return (parseInt(whole, 10) || 0) * 6 + (parseInt(part ?? '0', 10) || 0)
}

/**
 * Parse Play Cricket date format "Sat, 01 Jun, 2024" → "YYYY-MM-DD".
 * Falls back to the raw string if parsing fails.
 */
export function parsePCDate(raw: string): string {
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return raw
    return d.toISOString().split('T')[0]
  } catch {
    return raw
  }
}

/** True if the match description mentions the given club name (case-insensitive). */
export function isSloughTeam(name: string | null | undefined): boolean {
  return /slough/i.test(name ?? "")
}

/**
 * Keywords that identify colts, junior, or age-category matches.
 * Any match where home_team_name, away_team_name, competition_name, or
 * league_name contains one of these strings (case-insensitive) is excluded
 * from senior sync.
 */
const YOUTH_KEYWORDS = [
  'colts', 'under',
  'u9', 'u10', 'u11', 'u12', 'u13', 'u14', 'u15', 'u16', 'u17', 'u18',
  'junior', 'youth', 'girls', 'boys', 'kwik', 'tape ball',
]

const YOUTH_RE = new RegExp(
  YOUTH_KEYWORDS.map(k => `\\b${k.replace(' ', '\\s+')}\\b`).join('|'),
  'i',
)

/**
 * Returns true when the match is a colts/junior/age-category fixture and
 * should be excluded from senior sync.
 */
export function isYouthMatch(match: Pick<
  PCMatchSummary,
  'home_team_name' | 'away_team_name' | 'competition_name' | 'league_name'
>): boolean {
  const fields = [
    match.home_team_name,
    match.away_team_name,
    match.competition_name ?? '',
    match.league_name      ?? '',
  ]
  return fields.some(f => YOUTH_RE.test(f))
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List all matches for a site, optionally filtered by season year.
 * Leave season undefined to get all seasons.
 */
export async function getMatches(
  siteId: string = SITE_ID,
  season?: string,
): Promise<PCMatchSummary[]> {
  const params: Record<string, string> = { site_id: siteId }
  if (season) params.season = season
  const data = await apiFetch<{ matches?: PCMatchSummary[] }>('matches', params)
  return data.matches ?? []
}

/**
 * Full match detail: playing XIs and full innings scorecard.
 * Returns null if the match is not found or not yet published.
 */
export async function getMatchDetail(matchId: string): Promise<PCMatchDetail | null> {
  const data = await apiFetch<{ match_details?: PCMatchDetail[] }>('match_detail', { match_id: matchId })
  return data.match_details?.[0] ?? null
}

/**
 * Completed matches with results.
 */
export async function getResultMatches(
  siteId: string = SITE_ID,
  season?: string,
): Promise<PCMatchSummary[]> {
  const all = await getMatches(siteId, season)
  return all.filter(m => m.status === 'Completed' && m.published === 'Yes')
}

/**
 * Basic club / site information.
 */
export async function getSiteInfo(siteId: string = SITE_ID): Promise<PCSiteInfo | null> {
  const data = await apiFetch<{ site_info?: PCSiteInfo[] }>('site_info', { site_id: siteId })
  return data.site_info?.[0] ?? null
}
