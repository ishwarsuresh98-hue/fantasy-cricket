export type UserRole = 'admin' | 'member'
export type PlayerRole = 'batsman' | 'bowler' | 'all_rounder' | 'wicket_keeper'
export type MatchStatus = 'upcoming' | 'completed'

export interface Profile {
  id: string
  display_name: string
  role: UserRole
  avatar_url: string | null
  created_at: string
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
  opponent: string
  match_date: string
  venue: string | null
  status: MatchStatus
  result: string | null
  created_at: string
}

export interface FantasyTeam {
  id: string
  user_id: string
  season_id: string
  team_name: string
  total_points: number
  created_at: string
  profiles?: Profile
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
  runs_scored: number
  balls_faced: number
  fours: number
  sixes: number
  did_not_bat: boolean
  wickets: number
  catches: number
  stumpings: number
  run_outs: number
  base_points: number
  players?: Player
}

export interface LeaderboardEntry {
  rank: number
  fantasy_team_id: string
  team_name: string
  user_id: string
  display_name: string
  total_points: number
}
