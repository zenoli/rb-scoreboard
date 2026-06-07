export interface UserScore {
  user_id: number
  username: string
  is_active: boolean
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
  clean_sheets: number
  coach_winner: number
  total: number
}

export interface ScoreboardResponse {
  users: UserScore[]
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
}

export interface PlayerBrief {
  id: number
  display_name: string | null
  image_path: string | null
  team_name: string | null
  position_category: string | null
}

export interface CoachBrief {
  id: number
  display_name: string | null
  image_path: string | null
  team_name: string | null
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
}

export interface CoachResponse {
  id: number
  display_name: string | null
  name: string | null
  image_path: string | null
  team_id: number | null
  team_name: string | null
}

export interface ScoringRule {
  event_key: string
  weight: number
}

export interface AdminUser {
  id: number
  username: string
  email: string
  is_admin: boolean
  is_active: boolean
}
