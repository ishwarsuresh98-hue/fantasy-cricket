export interface Club {
  id: string
  name: string
  slug: string
  logo_url: string | null
  location: string | null
  primary_color: string | null
  created_at: string
}

export type UserRole = 'admin' | 'member'
export type PlayerRole = 'batsman' | 'bowler' | 'all_rounder' | 'wicket_keeper'
export type MatchStatus = 'upcoming' | 'completed'
export type BoosterType =
  | 'batting_surge'
  | 'keeping_surge'
  | 'bowling_surge'
  | 'free_hit'
  | 'triple_captain'
  | 'mega_transfer'
  | 'double_power'
  | 'score_freeze'
  | 'underdog'

export interface TeamBooster {
  id: string
  fantasy_team_id: string
  booster_type: BoosterType
  match_id: string
  selected_player_id: string | null
  booster_metadata: Record<string, unknown>
  created_at: string
}

export interface Profile {
  id: string
  display_name: string
  role: UserRole
  avatar_url: string | null
  created_at: string
  whatsapp_number?: string | null
  onboarding_complete?: boolean
}

export interface Season {
  id: string
  name: string
  start_date: string | null
  end_date: string | null
  is_active: boolean
  team_budget: number
  players_per_team: number
  created_at: string
}

export interface Player {
  id: string
  season_id: string
  name: string
  role: PlayerRole
  price: number
  profile_id: string | null
  is_active: boolean
  created_at: string
}

export interface Match {
  id: string
  season_id: string
  match_number: number
  opponent_team: string          // opponent club + XI, e.g. "Wraysbury CC - 1st XI"
  our_team?: string | null       // our XI, e.g. "Slough CC - 1st XI"
  match_date: string
  venue: string | null
  status: MatchStatus
  result: string | null
  play_cricket_id?: string | null
  created_at: string
}

export interface FantasyTeam {
  id: string
  user_id: string
  season_id: string
  team_name: string
  total_points: number
  transfers_used: number
  transfer_limit: number
  created_at: string
  profiles?: Profile
}

export interface TransferLog {
  id: string
  fantasy_team_id: string
  match_id: string | null
  players_in: string[]
  players_out: string[]
  transfers_used: number
  is_mega_transfer: boolean
  admin_adjustment: boolean
  admin_note: string | null
  created_at: string
}

export interface FantasySelection {
  id: string
  fantasy_team_id: string
  match_id: string
  player_id: string
  is_captain: boolean
  is_vice_captain: boolean
  points_earned: number
  players?: Player
}

export interface MatchPerformance {
  id: string
  match_id: string
  player_id: string
  player_role?: PlayerRole | null   // used by scoring to gate SR bonus/penalty
  runs_scored: number
  balls_faced: number
  fours: number
  sixes: number
  did_not_bat: boolean
  wickets: number
  catches: number
  stumpings: number
  run_outs: number
  dot_balls: number
  maidens: number
  base_points: number
  players?: Player
}

export interface PlayerCreditHistory {
  id: string
  player_id: string
  match_id: string
  credit_before: number
  credit_after: number
  base_points: number
  match_avg: number
  created_at: string
}

export interface LeaderboardEntry {
  rank: number
  fantasy_team_id: string
  team_name: string
  user_id: string
  display_name: string
  total_points: number
}

export interface MatchPlayingXI {
  id: string
  match_id: string
  player_id: string
  created_at: string
}

export type ContestType      = 'public' | 'private'
export type ContestCategory  = 'mega' | 'h2h' | 'small_league' | 'jackpot' | 'practice'
export type ContestSlotType  = 'head_to_head' | 'small_league' | 'mega' | 'winner_takes_all' | 'practice'
export type PaymentGateway   = 'flatpay' | 'stripe'
export type PaymentStatus    = 'pending' | 'confirmed' | 'failed'

export interface PrizeSlot {
  rank_from:  number
  rank_to:    number
  prize_pct:  number
}

export interface ContestTemplate {
  id:                  string
  club_id:             string
  name:                string
  type:                ContestSlotType
  entry_fee:           number
  max_entries:         number
  max_teams_per_user:  number
  platform_fee_pct:    number
  prize_structure:     PrizeSlot[]
  is_guaranteed:       boolean
  is_active:           boolean
  auto_create:         boolean
  max_instances:       number
  created_at:          string
}

export interface Contest {
  id:                  string
  season_id?:          string | null
  match_id:            string | null
  club_id?:            string | null
  name:                string
  title?:              string     // alias used by some DB versions
  type:                ContestType | ContestSlotType
  contest_category?:   ContestCategory
  entry_code:          string | null
  max_teams:           number
  max_entries?:        number     // alias for max_teams in new schema
  max_teams_per_user?: number
  entry_fee:           number
  prize_pool:          number
  prize_structure?:    PrizeSlot[]
  guaranteed_prize:    boolean
  is_guaranteed?:      boolean   // alias in new schema
  prize_description:   string | null
  platform_fee_pct?:   number
  status?:             'open' | 'locked' | 'completed'
  total_entries?:      number    // denormalised count
  created_by?:         string | null
  created_at:          string
}

export interface ContestEntry {
  id:              string
  contest_id:      string
  fantasy_team_id: string
  joined_at:       string
}

// ── Contest lobby / contests page shared types ────────────────────────────────

/** A contest as needed by the lobby card and contests page client. */
export interface LobbyContest {
  id:                string
  name:              string
  type:              'public' | 'private'
  contest_category:  ContestCategory
  entry_fee:         number
  prize_pool:        number
  guaranteed_prize:  boolean
  max_teams:         number
  prize_description: string | null
  entry_count:       number
  is_joined:         boolean
}

/** Upcoming match with its open contests, used on the contests list page. */
export interface MatchGroup {
  matchId:     string
  matchNumber: number
  opponent_team: string
  matchDate:   string
  venue:       string | null
  isNext:      boolean
  contests:    LobbyContest[]
}

export interface Wallet {
  id:         string
  user_id:    string
  balance:    number
  created_at: string
  updated_at: string
}

export interface WalletTransaction {
  id:           string
  wallet_id:    string
  type:         'credit' | 'debit'
  amount:       number
  description:  string
  reference_id: string | null
  created_at:   string
}

export interface PaymentIntent {
  id:                string
  user_id:           string
  contest_id:        string
  fantasy_team_id:   string
  amount:            number
  status:            PaymentStatus
  gateway:           PaymentGateway
  gateway_reference: string | null
  created_at:        string
  updated_at:        string
}

export interface ContestPayout {
  id:              string
  contest_id:      string
  user_id:         string
  fantasy_team_id: string
  rank:            number
  prize_amount:    number
  paid_at:         string | null
}

export interface Notification {
  id: string
  user_id: string
  type: 'rank_change' | 'points_update'
  title: string
  body: string
  is_read: boolean
  metadata: Record<string, unknown>
  created_at: string
}

// ── Gameweek contest types ────────────────────────────────────────────────────

/** One entry in a contest_team's players JSONB array. */
export interface ContestTeamPlayer {
  player_id:       string
  is_captain:      boolean
  is_vice_captain: boolean
}

/** Row from the contest_teams table. */
export interface ContestTeamRow {
  id:              string
  contest_id:      string
  user_id:         string
  players:         ContestTeamPlayer[]
  total_points:    number
  rank:            number | null
  created_at:      string
}

/** Row from the gameweeks table. */
export interface GameweekRow {
  id:         string
  season_id:  string
  match_id:   string | null
  number:     number
  match_date: string
  is_active:  boolean
  name:       string   // e.g. "GW5"
}

/** LobbyContest extended with gameweek metadata. */
export interface GWLobbyContest extends LobbyContest {
  gameweek_id:     string | null
  gameweek_number: number | null
  has_team:        boolean   // user already has a contest_team for this contest
}
