export interface UserScore {
  user_id: number
  username: string
  is_active: boolean
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
  clean_sheets: number
  volatile_clean_sheets: number
  coach_winner: number
  total: number
}

export interface ScoreboardResponse {
  season_name: string | null
  users: UserScore[]
}

export interface Season {
  id: number
  name: string
  sm_season_id: number
  is_active: boolean
}

export interface ScoreEvent {
  player_id: number | null
  player_name: string | null
  player_image_path: string | null
  team_name: string | null
  team_image_path: string | null
  opponent_name: string | null
  opponent_image_path: string | null
  event_type: 'goal' | 'assist' | 'yellow_card' | 'red_card' | 'clean_sheet' | 'coach_winner'
  minute: number | null
  points: number
  fixture_name: string | null
  is_volatile: boolean
}

export interface PlayerBrief {
  id: number
  display_name: string | null
  image_path: string | null
  team_name: string | null
  team_image_path: string | null
  position_category: string | null
}

export interface CoachBrief {
  id: number
  display_name: string | null
  image_path: string | null
  team_name: string | null
  team_image_path: string | null
}

export interface UserDraft {
  user_id: number
  username: string
  is_active: boolean
  players: PlayerBrief[]
  coach: CoachBrief | null
}

export interface PlayerPoints {
  player_id: number
  points: number
}

export interface PlayerResponse {
  id: number
  display_name: string | null
  common_name: string | null
  image_path: string | null
  jersey_number: number | null
  team_id: number | null
  team_name: string | null
  team_image_path: string | null
  team_short_code: string | null
  position_id: number | null
  position_name: string | null
  position_category: string | null
  total_points?: number | null
  drafted_by_username?: string | null
}

export interface CoachResponse {
  id: number
  display_name: string | null
  name: string | null
  image_path: string | null
  team_id: number | null
  team_name: string | null
  team_image_path: string | null
}

export interface ScoreHistorySeries {
  user_id: number
  username: string
  points: number[]
}

export interface ScoreHistoryResponse {
  dates: string[]
  series: ScoreHistorySeries[]
}

export interface LivePlayer {
  player_id: number
  display_name: string | null
  image_path: string | null
  team_image_path: string | null
  position_category: string | null
  drafted_by_username: string
  total_points: number
  live_points: number
  is_active: boolean
}

export interface LiveScoreEvent {
  player_id: number | null
  player_name: string | null
  player_image_path: string | null
  team_name: string | null
  team_image_path: string | null
  drafted_by_username: string | null
  event_type: 'goal' | 'assist' | 'yellow_card' | 'red_card' | 'clean_sheet'
  minute: number | null
  points: number
  fixture_name: string | null
}

export interface LiveResponse {
  is_live: boolean
  next_kickoff: string | null
  players: LivePlayer[]
  events: LiveScoreEvent[]
}

export interface FixtureParticipant {
  team_id: number
  team_name: string | null
  team_image_path: string | null
  location: string | null
}

export interface FixtureListItem {
  id: number
  name: string | null
  starting_at: string | null
  state: string | null
  home_score: number | null
  away_score: number | null
  participants: FixtureParticipant[]
}

export interface FixturePlayer {
  player_id: number
  display_name: string | null
  image_path: string | null
  team_image_path: string | null
  position_category: string | null
  drafted_by_username: string
  points: number
}

export interface FixtureDetailResponse {
  fixture_id: number
  fixture_name: string | null
  state: string | null
  starting_at: string | null
  home_score: number | null
  away_score: number | null
  participants: FixtureParticipant[]
  players: FixturePlayer[]
  events: LiveScoreEvent[]
}

export interface ScoringRule {
  event_key: string
  weight: number
}

export interface AdminUser {
  id: number
  username: string
  is_admin: boolean
  is_active: boolean
}
