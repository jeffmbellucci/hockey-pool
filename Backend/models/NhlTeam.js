const pool = require('../config/database');

class NhlTeam {
  // Get all NHL teams
  static async findAll() {
    const query = `
      SELECT 
        nt.team_id,
        nt.team_name,
        nt.abbreviation,
        nt.division_id,
        d.conference_name,
        d.division_name,
        nt.created_at
      FROM nhl_teams nt
      JOIN divisions d ON nt.division_id = d.division_id
      ORDER BY d.conference_name, d.division_name, nt.team_name
    `;
    const { rows } = await pool.query(query);
    return rows;
  }

  // Get team by ID
  static async findById(teamId) {
    const query = `
      SELECT 
        nt.team_id,
        nt.team_name,
        nt.abbreviation,
        nt.division_id,
        d.conference_name,
        d.division_name,
        nt.created_at
      FROM nhl_teams nt
      JOIN divisions d ON nt.division_id = d.division_id
      WHERE nt.team_id = $1
    `;
    const { rows } = await pool.query(query, [teamId]);
    return rows[0];
  }

  // Get team by abbreviation
  static async findByAbbreviation(abbreviation) {
    const query = `
      SELECT 
        nt.team_id,
        nt.team_name,
        nt.abbreviation,
        nt.division_id,
        d.conference_name,
        d.division_name,
        nt.created_at
      FROM nhl_teams nt
      JOIN divisions d ON nt.division_id = d.division_id
      WHERE nt.abbreviation = $1
    `;
    const { rows } = await pool.query(query, [abbreviation]);
    return rows[0];
  }

  // Get teams by division
  static async findByDivision(divisionId) {
    const query = `
      SELECT 
        nt.team_id,
        nt.team_name,
        nt.abbreviation,
        nt.division_id,
        d.conference_name,
        d.division_name,
        nt.created_at
      FROM nhl_teams nt
      JOIN divisions d ON nt.division_id = d.division_id
      WHERE nt.division_id = $1
      ORDER BY nt.team_name
    `;
    const { rows } = await pool.query(query, [divisionId]);
    return rows;
  }

  // Get teams by conference
  static async findByConference(conferenceName) {
    const query = `
      SELECT 
        nt.team_id,
        nt.team_name,
        nt.abbreviation,
        nt.division_id,
        d.conference_name,
        d.division_name,
        nt.created_at
      FROM nhl_teams nt
      JOIN divisions d ON nt.division_id = d.division_id
      WHERE d.conference_name = $1
      ORDER BY d.division_name, nt.team_name
    `;
    const { rows } = await pool.query(query, [conferenceName]);
    return rows;
  }
}

module.exports = NhlTeam;

