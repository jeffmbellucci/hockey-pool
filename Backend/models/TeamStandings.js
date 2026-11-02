const pool = require('../config/database');

class TeamStandings {
  // Get all team standings
  static async findAll() {
    const query = `
      SELECT * FROM team_standings
      ORDER BY points DESC, wins DESC, team_name
    `;
    const { rows } = await pool.query(query);
    return rows;
  }

  // Get standings by team ID
  static async findByTeamId(teamId) {
    const query = `
      SELECT * FROM team_standings
      WHERE team_id = $1
    `;
    const { rows } = await pool.query(query, [teamId]);
    return rows[0];
  }

  // Get standings for multiple teams
  static async findByTeamIds(teamIds) {
    const query = `
      SELECT * FROM team_standings
      WHERE team_id = ANY($1)
    `;
    const { rows } = await pool.query(query, [teamIds]);
    return rows;
  }

  // Refresh the materialized view (call after updating games)
  static async refresh() {
    const query = 'REFRESH MATERIALIZED VIEW team_standings';
    await pool.query(query);
  }

  // Get standings with team details
  static async findAllWithDetails() {
    const query = `
      SELECT 
        ts.*,
        d.division_name,
        d.conference_name
      FROM team_standings ts
      JOIN nhl_teams nt ON ts.team_id = nt.team_id
      JOIN divisions d ON nt.division_id = d.division_id
      ORDER BY ts.points DESC, ts.wins DESC, ts.team_name
    `;
    const { rows } = await pool.query(query);
    return rows;
  }

  // Get top N teams by wins
  static async getTopTeamsByWins(limit = 10) {
    const query = `
      SELECT * FROM team_standings
      ORDER BY wins DESC, points DESC
      LIMIT $1
    `;
    const { rows } = await pool.query(query, [limit]);
    return rows;
  }

  // Get standings by conference (requires join with nhl_teams)
  static async findByConference(conferenceName) {
    const query = `
      SELECT 
        ts.*,
        d.division_name
      FROM team_standings ts
      JOIN nhl_teams nt ON ts.team_id = nt.team_id
      JOIN divisions d ON nt.division_id = d.division_id
      WHERE d.conference_name = $1
      ORDER BY ts.points DESC, ts.wins DESC
    `;
    const { rows } = await pool.query(query, [conferenceName]);
    return rows;
  }

  // Get standings by division (requires join with nhl_teams)
  static async findByDivision(divisionId) {
    const query = `
      SELECT 
        ts.*,
        d.conference_name,
        d.division_name
      FROM team_standings ts
      JOIN nhl_teams nt ON ts.team_id = nt.team_id
      JOIN divisions d ON nt.division_id = d.division_id
      WHERE nt.division_id = $1
      ORDER BY ts.points DESC, ts.wins DESC
    `;
    const { rows } = await pool.query(query, [divisionId]);
    return rows;
  }
}

module.exports = TeamStandings;
