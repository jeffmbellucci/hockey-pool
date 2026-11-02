const pool = require('../config/database');

class Division {
  // Get all divisions
  static async findAll() {
    const query = `
      SELECT division_id, conference_name, division_name, created_at
      FROM divisions
      ORDER BY division_id
    `;
    const { rows } = await pool.query(query);
    return rows;
  }

  // Get division by ID
  static async findById(divisionId) {
    const query = `
      SELECT division_id, conference_name, division_name, created_at
      FROM divisions
      WHERE division_id = $1
    `;
    const { rows } = await pool.query(query, [divisionId]);
    return rows[0];
  }

  // Get divisions by conference (case-insensitive)
  static async findByConference(conferenceName) {
    const query = `
      SELECT division_id, conference_name, division_name, created_at
      FROM divisions
      WHERE LOWER(conference_name) = LOWER($1)
      ORDER BY division_name
    `;
    const { rows } = await pool.query(query, [conferenceName]);
    return rows;
  }
}

module.exports = Division;

