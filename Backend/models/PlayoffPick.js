const pool = require('../config/database');

class PlayoffPick {
  /**
   * Create a new playoff pick
   * @param {number} participantId - Participant ID
   * @param {number} contestId - Contest ID
   * @param {number[]} teamIds - Array of team IDs
   */
  static async create(participantId, contestId, teamIds = []) {
    const query = `
      INSERT INTO playoff_picks (participant_id, contest_id, team_ids)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const { rows } = await pool.query(query, [participantId, contestId, teamIds]);
    return rows[0];
  }

  /**
   * Find playoff pick by ID
   * @param {number} pickId - Playoff pick ID
   */
  static async findById(pickId) {
    const query = `
      SELECT pp.*, 
             p.participant_name,
             p.draft_order,
             c.contest_name
      FROM playoff_picks pp
      JOIN pool_participants p ON pp.participant_id = p.participant_id
      JOIN contests c ON pp.contest_id = c.contest_id
      WHERE pp.playoff_pick_id = $1
    `;
    const { rows } = await pool.query(query, [pickId]);
    return rows[0];
  }

  /**
   * Find playoff pick by participant ID
   * @param {number} participantId - Participant ID
   */
  static async findByParticipantId(participantId) {
    const query = `
      SELECT * FROM playoff_picks
      WHERE participant_id = $1
    `;
    const { rows } = await pool.query(query, [participantId]);
    return rows[0];
  }

  /**
   * Find all playoff picks for a contest
   * @param {number} contestId - Contest ID
   */
  static async findByContestId(contestId) {
    const query = `
      SELECT pp.*, 
             p.participant_name,
             p.draft_order,
             p.user_id
      FROM playoff_picks pp
      JOIN pool_participants p ON pp.participant_id = p.participant_id
      WHERE pp.contest_id = $1
      ORDER BY p.draft_order
    `;
    const { rows } = await pool.query(query, [contestId]);
    return rows;
  }

  /**
   * Add a team to a playoff pick
   * @param {number} participantId - Participant ID
   * @param {number} teamId - Team ID to add
   */
  static async addTeamToPick(participantId, teamId) {
    const query = `
      UPDATE playoff_picks
      SET team_ids = array_append(team_ids, $2),
          updated_at = CURRENT_TIMESTAMP
      WHERE participant_id = $1
      RETURNING *
    `;
    const { rows } = await pool.query(query, [participantId, teamId]);
    return rows[0];
  }

  /**
   * Check if a team is already picked in a contest
   * @param {number} teamId - Team ID
   * @param {number} contestId - Contest ID
   */
  static async isTeamPicked(teamId, contestId) {
    const query = `
      SELECT COUNT(*) as count
      FROM playoff_picks
      WHERE contest_id = $1 AND $2 = ANY(team_ids)
    `;
    const { rows } = await pool.query(query, [contestId, teamId]);
    return parseInt(rows[0].count) > 0;
  }

  /**
   * Get available playoff teams for a contest (not yet picked)
   * @param {number} contestId - Contest ID
   */
  static async getAvailableTeams(contestId, client = pool) {
    // Get the contest to check if there's an excluded team
    const contestQuery = `
      SELECT excluded_team_id, season_year FROM contests WHERE contest_id = $1
    `;
    const { rows: contestRows } = await client.query(contestQuery, [contestId]);
    const excludedTeamId = contestRows[0]?.excluded_team_id;

    let query = `
      SELECT DISTINCT 
        t.team_id,
        t.team_name,
        t.abbreviation,
        d.conference_name,
        d.division_name
      FROM nhl_teams t
      JOIN divisions d ON t.division_id = d.division_id
      WHERE t.nhl_api_id IN (
        SELECT nhl_api_id 
        FROM playoff_standings 
        WHERE is_playoff_team = TRUE
          AND standings_date = (
            SELECT MAX(standings_date) FROM playoff_standings
            WHERE EXTRACT(YEAR FROM standings_date - INTERVAL '6 months')::text = $2
          )
      )
      AND t.team_id NOT IN (
        SELECT DISTINCT unnest(team_ids)
        FROM playoff_picks
        WHERE contest_id = $1
      )
    `;

    const params = [contestId, contestRows[0]?.season_year.split('-')[0]];

    // Exclude the specific team for 3-participant tiebreaker
    if (excludedTeamId) {
      query += ` AND t.team_id != $3`;
      params.push(excludedTeamId);
    }

    query += ' ORDER BY d.conference_name, t.team_name';

    const { rows } = await client.query(query, params);
    return rows;
  }

  /**
   * Calculate and update playoff wins for a participant
   * @param {number} participantId - Participant ID
   */
  static async calculateAndUpdateWins(participantId, client = pool) {
    const query = `
      UPDATE playoff_picks p
      SET total_playoff_wins = scores.total_playoff_wins,
          updated_at = CURRENT_TIMESTAMP
      FROM playoff_pick_scores scores
      WHERE p.playoff_pick_id = scores.playoff_pick_id AND p.participant_id = $1
      RETURNING p.*
    `;
    const { rows } = await client.query(query, [participantId]);
    return rows[0];
  }

  /**
   * Calculate and update wins for all playoff picks
   * Uses a single SQL query like TwoTeamPick for efficiency
   */
  static async calculateAndUpdateAllWins() {
    const query = `
      UPDATE playoff_picks pp
      SET total_playoff_wins = scores.total_playoff_wins,
      updated_at = CURRENT_TIMESTAMP
      FROM playoff_pick_scores scores
      WHERE pp.playoff_pick_id = scores.playoff_pick_id
      RETURNING pp.*
    `;
    const { rows } = await pool.query(query);
    return rows;
  }

  /**
   * Get playoff leaderboard for a contest
   * @param {number} contestId - Contest ID
   */
  static async getLeaderboard(contestId) {
    const query = `
      SELECT 
        p.participant_id,
        p.participant_name,
        p.draft_order,
        COALESCE(pp.team_ids, '{}') as team_ids,
        COALESCE(scores.total_playoff_wins, 0) as total_playoff_wins,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'team_id', t.team_id,
            'team_name', t.team_name,
            'abbreviation', t.abbreviation
          ))
          FROM unnest(pp.team_ids) tid
          JOIN nhl_teams t ON t.team_id = tid
          ), '[]'::json
        ) as teams
      FROM pool_participants p
      LEFT JOIN playoff_picks pp ON p.participant_id = pp.participant_id
      LEFT JOIN playoff_pick_scores scores ON scores.playoff_pick_id = pp.playoff_pick_id
      WHERE p.contest_id = $1 AND p.active = TRUE
      ORDER BY scores.total_playoff_wins DESC NULLS LAST, p.participant_name
    `;
    const { rows } = await pool.query(query, [contestId]);
    return rows;
  }

  /**
   * Delete a playoff pick
   * @param {number} pickId - Playoff pick ID
   */
  static async delete(pickId) {
    const query = 'DELETE FROM playoff_picks WHERE playoff_pick_id = $1 RETURNING *';
    const { rows } = await pool.query(query, [pickId]);
    return rows[0];
  }
}

module.exports = PlayoffPick;
