const pool = require('../config/database');

class TwoTeamPick {
  // Create a new pick
  static async create(participantId, team1Id, team2Id, contestId = null) {
    const query = `
      INSERT INTO two_team_picks (participant_id, team1_id, team2_id, contest_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const { rows } = await pool.query(query, [participantId, team1Id, team2Id, contestId]);
    return rows[0];
  }

  // Get all picks with full details (optionally filter by contest)
  static async findAll(contestId = null) {
    let query = `
      SELECT 
        ttp.*,
        pp.participant_name,
        pp.draft_order,
        t1.team_name as team1_name,
        t1.abbreviation as team1_abbrev,
        t2.team_name as team2_name,
        t2.abbreviation as team2_abbrev
      FROM two_team_picks ttp
      JOIN pool_participants pp ON ttp.participant_id = pp.participant_id
      JOIN nhl_teams t1 ON ttp.team1_id = t1.team_id
      LEFT JOIN nhl_teams t2 ON ttp.team2_id = t2.team_id
      WHERE pp.active = TRUE
    `;
    
    const params = [];
    if (contestId !== null) {
      query += ' AND ttp.contest_id = $1';
      params.push(contestId);
    }
    
    query += ' ORDER BY ttp.total_wins DESC, pp.participant_name';
    
    const { rows } = await pool.query(query, params);
    return rows;
  }

  // Get pick by participant ID
  static async findByParticipantId(participantId) {
    const query = `
      SELECT 
        ttp.*,
        pp.participant_name,
        pp.draft_order,
        t1.team_name as team1_name,
        t1.abbreviation as team1_abbrev,
        t2.team_name as team2_name,
        t2.abbreviation as team2_abbrev
      FROM two_team_picks ttp
      JOIN pool_participants pp ON ttp.participant_id = pp.participant_id
      JOIN nhl_teams t1 ON ttp.team1_id = t1.team_id
      LEFT JOIN nhl_teams t2 ON ttp.team2_id = t2.team_id
      WHERE ttp.participant_id = $1
    `;
    const { rows } = await pool.query(query, [participantId]);
    return rows[0];
  }

  // Get pick by ID
  static async findById(pickId) {
    const query = `
      SELECT 
        ttp.*,
        pp.participant_name,
        pp.draft_order,
        t1.team_name as team1_name,
        t1.abbreviation as team1_abbrev,
        t2.team_name as team2_name,
        t2.abbreviation as team2_abbrev
      FROM two_team_picks ttp
      JOIN pool_participants pp ON ttp.participant_id = pp.participant_id
      JOIN nhl_teams t1 ON ttp.team1_id = t1.team_id
      LEFT JOIN nhl_teams t2 ON ttp.team2_id = t2.team_id
      WHERE ttp.pick_id = $1
    `;
    const { rows } = await pool.query(query, [pickId]);
    return rows[0];
  }

  // Update pick
  static async update(pickId, team1Id, team2Id = null) {
    const query = `
      UPDATE two_team_picks 
      SET team1_id = $1, team2_id = $2, updated_at = CURRENT_TIMESTAMP
      WHERE pick_id = $3
      RETURNING *
    `;
    const { rows } = await pool.query(query, [team1Id, team2Id, pickId]);
    return rows[0];
  }

  // Update total wins for a pick
  static async updateTotalWins(pickId, totalWins) {
    const query = `
      UPDATE two_team_picks 
      SET total_wins = $1, updated_at = CURRENT_TIMESTAMP
      WHERE pick_id = $2
      RETURNING *
    `;
    const { rows } = await pool.query(query, [totalWins, pickId]);
    return rows[0];
  }

  // Calculate and update total wins for a participant based on latest stats
  static async calculateAndUpdateWins(participantId, client = pool) {
    const query = `
      UPDATE two_team_picks ttp
      SET total_wins = scores.total_wins,
          updated_at = CURRENT_TIMESTAMP
      FROM two_team_pick_scores scores
      WHERE ttp.pick_id = scores.pick_id
        AND ttp.participant_id = $1
      RETURNING ttp.*
    `;
    const { rows } = await client.query(query, [participantId]);
    return rows[0];
  }

  // Calculate and update total wins for all participants
  static async calculateAndUpdateAllWins() {
    const query = `
      UPDATE two_team_picks
      SET total_wins = sub.total_wins,
          updated_at = CURRENT_TIMESTAMP
      FROM two_team_pick_scores sub
      WHERE two_team_picks.pick_id = sub.pick_id
      RETURNING two_team_picks.*
    `;
    const { rows } = await pool.query(query);
    return rows;
  }

  // Get leaderboard (optionally filter by contest)
  static async getLeaderboard(contestId = null) {
    let query = `
      SELECT 
        pp.participant_id,
        pp.participant_name,
        pp.draft_order,
        pp.user_id,
        t1.team_name AS team1_name,
        t1.abbreviation AS team1_abbrev,
        t2.team_name AS team2_name,
        t2.abbreviation AS team2_abbrev,
        scores.team1_wins,
        scores.team2_wins,
        scores.total_wins,
        ttp.created_at AS pick_date
      FROM two_team_picks ttp
      JOIN pool_participants pp ON ttp.participant_id = pp.participant_id
      JOIN nhl_teams t1 ON ttp.team1_id = t1.team_id
      LEFT JOIN nhl_teams t2 ON ttp.team2_id = t2.team_id
      JOIN two_team_pick_scores scores ON scores.pick_id = ttp.pick_id
      WHERE pp.active = TRUE
    `;
    
    const params = [];
    if (contestId !== null) {
      query += ' AND ttp.contest_id = $1';
      params.push(contestId);
    }
    
    query += ' ORDER BY scores.total_wins DESC, pp.participant_name ASC';
    
    const { rows } = await pool.query(query, params);
    return rows;
  }

  // Delete pick
  static async delete(pickId) {
    const query = 'DELETE FROM two_team_picks WHERE pick_id = $1 RETURNING *';
    const { rows } = await pool.query(query, [pickId]);
    return rows[0];
  }

  // Check if a team is already picked in a contest
  static async isTeamPicked(teamId, contestId = null, excludePickId = null) {
    let query = `
      SELECT COUNT(*) FROM two_team_picks 
      WHERE (team1_id = $1 OR team2_id = $1)
    `;
    const params = [teamId];
    let paramCount = 2;
    
    if (contestId !== null) {
      query += ` AND contest_id = $${paramCount}`;
      params.push(contestId);
      paramCount++;
    }
    
    if (excludePickId) {
      query += ` AND pick_id != $${paramCount}`;
      params.push(excludePickId);
    }
    
    const { rows } = await pool.query(query, params);
    return parseInt(rows[0].count) > 0;
  }

  // Get available teams (not yet picked in a contest)
  static async getAvailableTeams(contestId = null) {
    let query = `
      SELECT 
        nt.*,
        d.conference_name,
        d.division_name
      FROM nhl_teams nt
      JOIN divisions d ON nt.division_id = d.division_id
      WHERE nt.team_id NOT IN (
    `;
    
    const params = [];
    if (contestId !== null) {
      query += `
        SELECT team1_id FROM two_team_picks WHERE contest_id = $1 AND team1_id IS NOT NULL
        UNION
        SELECT team2_id FROM two_team_picks WHERE contest_id = $1 AND team2_id IS NOT NULL
      `;
      params.push(contestId);
    } else {
      query += `
        SELECT team1_id FROM two_team_picks WHERE team1_id IS NOT NULL
        UNION
        SELECT team2_id FROM two_team_picks WHERE team2_id IS NOT NULL
      `;
    }
    
    query += `
      )
      ORDER BY d.conference_name, d.division_name, nt.team_name
    `;
    
    const { rows } = await pool.query(query, params);
    return rows;
  }
}

module.exports = TwoTeamPick;

