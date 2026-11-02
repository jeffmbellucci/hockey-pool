/**
 * Test fixtures — reusable test data for all backend tests.
 */

const fixtures = {
  users: {
    admin: {
      id: 1,
      email: 'admin@test.com',
      name: 'Admin',
      role: 'admin',
      active: true,
      password: '$2b$12$hashedpasswordhere', // bcrypt hash placeholder
    },
    player: {
      id: 2,
      email: 'player@test.com',
      name: 'Player',
      role: 'user',
      active: true,
    },
    inactive: {
      id: 3,
      email: 'inactive@test.com',
      name: 'Inactive',
      role: 'user',
      active: false,
    },
  },

  teams: {
    tor: { team_id: 1, team_name: 'Toronto Maple Leafs', abbreviation: 'TOR', nhl_api_id: 10 },
    mtl: { team_id: 2, team_name: 'Montreal Canadiens', abbreviation: 'MTL', nhl_api_id: 8 },
    bos: { team_id: 3, team_name: 'Boston Bruins', abbreviation: 'BOS', nhl_api_id: 6 },
    nyr: { team_id: 4, team_name: 'New York Rangers', abbreviation: 'NYR', nhl_api_id: 3 },
  },

  contests: {
    twoTeam: {
      contest_id: 1,
      contest_name: 'Test Two-Team',
      contest_type: 'two_team',
      status: 'waiting',
      max_participants: 16,
      season_year: '2025-26',
    },
    survivor: {
      contest_id: 2,
      contest_name: 'Test Survivor',
      contest_type: 'survivor',
      status: 'in_progress',
      current_week: 1,
      season_year: '2025-26',
    },
  },

  games: {
    torWin: {
      game_id: 2025020001,
      game_date: '2025-10-10',
      game_type: 2,
      game_state: 'OFF',
      team_id: 1,
      team_abbrev: 'TOR',
      team_score: 4,
      is_home: true,
      opponent_id: 2,
      opponent_abbrev: 'MTL',
      opponent_score: 2,
      result: 'W',
    },
    mtlOtl: {
      game_id: 2025020002,
      game_date: '2025-10-11',
      game_type: 2,
      game_state: 'OFF',
      team_id: 2,
      team_abbrev: 'MTL',
      team_score: 3,
      is_home: false,
      opponent_id: 3,
      opponent_abbrev: 'BOS',
      opponent_score: 4,
      result: 'OTL',
    },
  },

  survivorWeek: {
    contest_id: 2,
    week_number: 1,
    start_date: '2025-10-06',
    end_date: '2025-10-12',
    lock_time: '2025-10-06T19:00:00Z',
    is_locked: false,
  },

  settings: {
    validKeys: [
      'season_start_date', 'season_end_date', 'season_year',
      'playoff_start_date', 'playoff_end_date',
      'auto_update_enabled', 'auto_update_interval_minutes',
      'auto_update_playoff_brackets',
    ],
  },
};

module.exports = fixtures;
