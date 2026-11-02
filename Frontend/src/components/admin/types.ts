export interface PlayoffStanding {
  standings_id: number;
  standings_date: string;
  team_abbrev: string;
  team_name: string;
  nhl_api_id: number;
  conference_name: string;
  conference_abbrev: string;
  conference_sequence: number;
  division_name: string;
  division_abbrev: string;
  division_sequence: number;
  wildcard_sequence: number;
  games_played: number;
  wins: number;
  losses: number;
  ot_losses: number;
  points: number;
  point_pctg: number;
  regulation_wins: number;
  goal_differential: number;
  goals_for: number;
  goals_against: number;
  is_playoff_team: boolean;
  created_at: string;
  updated_at: string;
}

