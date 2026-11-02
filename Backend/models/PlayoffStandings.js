const pool = require('../config/database');

class PlayoffStandings {
  /**
   * Get all playoff standings for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Array} Array of playoff standings
   */
  static async getByDate(date) {
    const query = `
      SELECT 
        standings_id,
        standings_date,
        team_abbrev,
        team_name,
        nhl_api_id,
        conference_name,
        conference_abbrev,
        conference_sequence,
        division_name,
        division_abbrev,
        division_sequence,
        wildcard_sequence,
        games_played,
        wins,
        losses,
        ot_losses,
        points,
        point_pctg,
        regulation_wins,
        goal_differential,
        goals_for,
        goals_against,
        is_playoff_team,
        created_at,
        updated_at
      FROM playoff_standings
      WHERE standings_date = $1
      ORDER BY conference_abbrev, conference_sequence
    `;
    
    const { rows } = await pool.query(query, [date]);
    return rows;
  }

  /**
   * Get playoff teams for a specific date (only teams in playoff position)
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Array} Array of playoff teams
   */
  static async getPlayoffTeamsByDate(date) {
    const query = `
      SELECT 
        standings_id,
        standings_date,
        team_abbrev,
        team_name,
        nhl_api_id,
        conference_name,
        conference_abbrev,
        conference_sequence,
        division_name,
        division_abbrev,
        division_sequence,
        wildcard_sequence,
        games_played,
        wins,
        losses,
        ot_losses,
        points,
        point_pctg,
        regulation_wins,
        goal_differential,
        goals_for,
        goals_against,
        is_playoff_team,
        created_at,
        updated_at
      FROM playoff_standings
      WHERE standings_date = $1 AND is_playoff_team = TRUE
      ORDER BY conference_abbrev, conference_sequence
    `;
    
    const { rows } = await pool.query(query, [date]);
    return rows;
  }

  /**
   * Get the most recent playoff standings
   * @returns {Array} Array of playoff standings
   */
  static async getLatest() {
    const query = `
      SELECT 
        standings_id,
        standings_date,
        team_abbrev,
        team_name,
        nhl_api_id,
        conference_name,
        conference_abbrev,
        conference_sequence,
        division_name,
        division_abbrev,
        division_sequence,
        wildcard_sequence,
        games_played,
        wins,
        losses,
        ot_losses,
        points,
        point_pctg,
        regulation_wins,
        goal_differential,
        goals_for,
        goals_against,
        is_playoff_team,
        created_at,
        updated_at
      FROM playoff_standings
      WHERE standings_date = (SELECT MAX(standings_date) FROM playoff_standings)
      ORDER BY conference_abbrev, conference_sequence
    `;
    
    const { rows } = await pool.query(query);
    return rows;
  }

  /**
   * Get the most recent playoff teams (only teams in playoff position)
   * @returns {Array} Array of playoff teams
   */
  static async getLatestPlayoffTeams() {
    const query = `
      SELECT 
        ps.standings_id,
        ps.standings_date,
        ps.team_abbrev,
        ps.team_name,
        ps.nhl_api_id,
        nt.team_id,
        ps.conference_name,
        ps.conference_abbrev,
        ps.conference_sequence,
        ps.division_name,
        ps.division_abbrev,
        ps.division_sequence,
        ps.wildcard_sequence,
        ps.games_played,
        ps.wins,
        ps.losses,
        ps.ot_losses,
        ps.points,
        ps.point_pctg,
        ps.regulation_wins,
        ps.goal_differential,
        ps.goals_for,
        ps.goals_against,
        ps.is_playoff_team,
        ps.created_at,
        ps.updated_at
      FROM playoff_standings ps
      JOIN nhl_teams nt ON ps.nhl_api_id = nt.nhl_api_id
      WHERE ps.standings_date = (SELECT MAX(standings_date) FROM playoff_standings)
        AND ps.is_playoff_team = TRUE
      ORDER BY ps.conference_abbrev, ps.conference_sequence
    `;
    
    const { rows } = await pool.query(query);
    return rows;
  }

  /**
   * Update a single playoff standing record
   * @param {number} standingsId - Standings ID
   * @param {Object} updateData - Data to update
   * @returns {Object} Updated standing
   */
  static async update(standingsId, updateData) {
    const allowedFields = [
      'is_playoff_team',
      'conference_sequence',
      'division_sequence',
      'wildcard_sequence',
      'points',
      'wins',
      'losses',
      'ot_losses',
      'games_played',
      'point_pctg',
      'regulation_wins',
      'goal_differential',
      'goals_for',
      'goals_against'
    ];

    const keys = Object.keys(updateData).filter(key => allowedFields.includes(key));
    
    if (keys.length === 0) {
      throw new Error('No valid fields to update');
    }

    const values = keys.map(key => updateData[key]);
    
    let setClause = keys.map((key, index) => `${key} = $${index + 1}`).join(', ');
    setClause += `, updated_at = NOW()`;
    
    values.push(standingsId);
    
    const query = `
      UPDATE playoff_standings
      SET ${setClause}
      WHERE standings_id = $${values.length}
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, values);
    return rows[0] || null;
  }

  /**
   * Delete playoff standings for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {boolean} True if deleted
   */
  static async deleteByDate(date) {
    const query = 'DELETE FROM playoff_standings WHERE standings_date = $1';
    await pool.query(query, [date]);
    return true;
  }

  /**
   * Get available dates with playoff standings
   * @returns {Array} Array of dates
   */
  static async getAvailableDates() {
    const query = `
      SELECT DISTINCT standings_date
      FROM playoff_standings
      ORDER BY standings_date DESC
      LIMIT 30
    `;
    
    const { rows } = await pool.query(query);
    return rows.map(row => row.standings_date);
  }
}

module.exports = PlayoffStandings;

