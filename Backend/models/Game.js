const pool = require('../config/database');

class Game {
  /**
   * Get all games grouped by date
   * @param {number} limit - Optional limit for number of games
   * @param {number} offset - Optional offset for pagination
   */
  static async findAll(limit = 100, offset = 0, gameType = null) {
    const params = [limit, offset];
    let typeFilter = '';
    if (gameType !== null) {
      params.push(gameType);
      typeFilter = `WHERE g.game_type = $${params.length}`;
    }
    const query = `
      SELECT 
        g.game_id,
        g.game_date,
        g.game_type,
        g.game_state,
        g.team_id,
        g.team_abbrev,
        g.team_score,
        g.is_home,
        g.opponent_id,
        g.opponent_abbrev,
        g.opponent_score,
        g.opponent_logo,
        g.result,
        g.created_at,
        g.updated_at,
        t1.team_name as team_name,
        t2.team_name as opponent_name
      FROM games g
      LEFT JOIN nhl_teams t1 ON g.team_id = t1.team_id
      LEFT JOIN nhl_teams t2 ON g.opponent_id = t2.team_id
      ${typeFilter}
      ORDER BY g.game_date DESC, g.game_id
      LIMIT $1 OFFSET $2
    `;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Get games by date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   */
  static async findByDateRange(startDate, endDate, gameType = null) {
    const params = [startDate, endDate];
    let typeFilter = '';
    if (gameType !== null) {
      params.push(gameType);
      typeFilter = `AND g.game_type = $${params.length}`;
    }
    const query = `
      SELECT 
        g.game_id,
        g.game_date,
        g.game_type,
        g.game_state,
        g.team_id,
        g.team_abbrev,
        g.team_score,
        g.is_home,
        g.opponent_id,
        g.opponent_abbrev,
        g.opponent_score,
        g.opponent_logo,
        g.result,
        g.created_at,
        g.updated_at,
        t1.team_name as team_name,
        t2.team_name as opponent_name
      FROM games g
      LEFT JOIN nhl_teams t1 ON g.team_id = t1.team_id
      LEFT JOIN nhl_teams t2 ON g.opponent_id = t2.team_id
      WHERE g.game_date >= $1 AND g.game_date <= $2 ${typeFilter}
      ORDER BY g.game_date DESC, g.game_id
    `;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Get games by specific date
   * @param {string} date - Date (YYYY-MM-DD)
   */
  static async findByDate(date, gameType = null) {
    const params = [date];
    let typeFilter = '';
    if (gameType !== null) {
      params.push(gameType);
      typeFilter = `AND g.game_type = $${params.length}`;
    }
    const query = `
      SELECT 
        g.game_id,
        g.game_date,
        g.game_type,
        g.game_state,
        g.team_id,
        g.team_abbrev,
        g.team_score,
        g.is_home,
        g.opponent_id,
        g.opponent_abbrev,
        g.opponent_score,
        g.opponent_logo,
        g.result,
        g.created_at,
        g.updated_at,
        t1.team_name as team_name,
        t2.team_name as opponent_name
      FROM games g
      LEFT JOIN nhl_teams t1 ON g.team_id = t1.team_id
      LEFT JOIN nhl_teams t2 ON g.opponent_id = t2.team_id
      WHERE g.game_date = $1 ${typeFilter}
      ORDER BY g.game_id
    `;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Get games grouped by date (one entry per unique game, not per team)
   */
  static async findGroupedByDate(gameType = null) {
    const params = [];
    let typeFilter = '';
    if (gameType !== null) {
      params.push(gameType);
      typeFilter = `WHERE game_type = $1`;
    }
    const query = `
      SELECT 
        TO_CHAR(g.game_date, 'YYYY-MM-DD') as game_date,
        json_agg(
          json_build_object(
            'game_id', g.game_id,
            'game_type', g.game_type,
            'game_state', g.game_state,
            'team_id', g.team_id,
            'team_abbrev', g.team_abbrev,
            'team_name', t1.team_name,
            'team_score', g.team_score,
            'is_home', g.is_home,
            'opponent_id', g.opponent_id,
            'opponent_abbrev', g.opponent_abbrev,
            'opponent_name', t2.team_name,
            'opponent_score', g.opponent_score,
            'opponent_logo', g.opponent_logo,
            'result', g.result
          ) ORDER BY g.game_id
        ) as games
      FROM (
        SELECT DISTINCT ON (game_id) 
          game_id,
          game_date,
          game_type,
          game_state,
          team_id,
          team_abbrev,
          team_score,
          is_home,
          opponent_id,
          opponent_abbrev,
          opponent_score,
          opponent_logo,
          result
        FROM games
        ${typeFilter}
        ORDER BY game_id, team_id
      ) g
      LEFT JOIN nhl_teams t1 ON g.team_id = t1.team_id
      LEFT JOIN nhl_teams t2 ON g.opponent_id = t2.team_id
      GROUP BY g.game_date
      ORDER BY g.game_date DESC
    `;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Get games for a specific team with optional date filtering
   * @param {number} teamId - Team ID
   * @param {string} startDate - Optional start date (YYYY-MM-DD)
   * @param {string} endDate - Optional end date (YYYY-MM-DD)
   */
  static async findByTeam(teamId, startDate = null, endDate = null, gameType = null) {
    let query = `
      SELECT 
        g.game_id,
        g.game_date,
        g.game_type,
        g.game_state,
        g.team_id,
        g.team_abbrev,
        g.team_score,
        g.is_home,
        g.opponent_id,
        g.opponent_abbrev,
        g.opponent_score,
        g.opponent_logo,
        g.result,
        g.created_at,
        g.updated_at,
        t1.team_name as team_name,
        t2.team_name as opponent_name
      FROM games g
      LEFT JOIN nhl_teams t1 ON g.team_id = t1.team_id
      LEFT JOIN nhl_teams t2 ON g.opponent_id = t2.team_id
      WHERE g.team_id = $1
    `;
    
    const params = [teamId];
    
    if (gameType !== null) {
      params.push(gameType);
      query += ` AND g.game_type = $${params.length}`;
    }
    
    if (startDate) {
      params.push(startDate);
      query += ` AND g.game_date >= $${params.length}`;
    }
    
    if (endDate) {
      params.push(endDate);
      query += ` AND g.game_date <= $${params.length}`;
    }
    
    query += ' ORDER BY g.game_date DESC, g.game_id';
    
    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Get game by ID
   * @param {number} gameId - Game ID
   * @param {number} teamId - Team ID
   */
  static async findById(gameId, teamId, gameType = null) {
    const params = [gameId, teamId];
    let typeFilter = '';
    if (gameType !== null) {
      params.push(gameType);
      typeFilter = `AND g.game_type = $${params.length}`;
    }
    const query = `
      SELECT 
        g.game_id,
        g.game_date,
        g.game_type,
        g.game_state,
        g.team_id,
        g.team_abbrev,
        g.team_score,
        g.is_home,
        g.opponent_id,
        g.opponent_abbrev,
        g.opponent_score,
        g.opponent_logo,
        g.result,
        g.created_at,
        g.updated_at,
        t1.team_name as team_name,
        t2.team_name as opponent_name
      FROM games g
      LEFT JOIN nhl_teams t1 ON g.team_id = t1.team_id
      LEFT JOIN nhl_teams t2 ON g.opponent_id = t2.team_id
      WHERE g.game_id = $1 AND g.team_id = $2 ${typeFilter}
    `;
    const { rows } = await pool.query(query, params);
    return rows[0];
  }

  /**
   * Update game score
   * @param {number} gameId - Game ID
   * @param {number} teamId - Team ID
   * @param {object} data - Update data {team_score, opponent_score, result, game_state}
   */
  static async updateScore(gameId, teamId, data, gameType = null) {
    const { team_score, opponent_score, result, game_state } = data;
    
    const params = [gameId, teamId, team_score, opponent_score, result, game_state];
    let typeFilter = '';
    if (gameType !== null) {
      params.push(gameType);
      typeFilter = `AND game_type = $${params.length}`;
    }
    
    const query = `
      UPDATE games
      SET 
        team_score = COALESCE($3, team_score),
        opponent_score = COALESCE($4, opponent_score),
        result = COALESCE($5, result),
        game_state = COALESCE($6, game_state),
        updated_at = CURRENT_TIMESTAMP
      WHERE game_id = $1 AND team_id = $2 ${typeFilter}
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, params);
    
    return rows[0];
  }

  /**
   * Create or update a game
   * @param {object} gameData - Game data
   */
  static async upsert(gameData) {
    const {
      game_id,
      game_date,
      game_type,
      game_state,
      team_id,
      team_abbrev,
      team_score,
      is_home,
      opponent_id,
      opponent_abbrev,
      opponent_score,
      opponent_logo,
      result
    } = gameData;

    const query = `
      INSERT INTO games (
        game_id, game_date, game_type, game_state,
        team_id, team_abbrev, team_score, is_home,
        opponent_id, opponent_abbrev, opponent_score, opponent_logo,
        result
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (game_id, team_id) 
      DO UPDATE SET
        game_date = EXCLUDED.game_date,
        game_type = EXCLUDED.game_type,
        game_state = EXCLUDED.game_state,
        team_abbrev = EXCLUDED.team_abbrev,
        team_score = EXCLUDED.team_score,
        is_home = EXCLUDED.is_home,
        opponent_id = EXCLUDED.opponent_id,
        opponent_abbrev = EXCLUDED.opponent_abbrev,
        opponent_score = EXCLUDED.opponent_score,
        opponent_logo = EXCLUDED.opponent_logo,
        result = EXCLUDED.result,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const { rows } = await pool.query(query, [
      game_id,
      game_date,
      game_type,
      game_state,
      team_id,
      team_abbrev,
      team_score,
      is_home,
      opponent_id,
      opponent_abbrev,
      opponent_score,
      opponent_logo,
      result
    ]);

    return rows[0];
  }

  /**
   * Delete a game
   * @param {number} gameId - Game ID
   * @param {number} teamId - Team ID
   */
  static async delete(gameId, teamId, gameType = null) {
    const params = [gameId, teamId];
    let typeFilter = '';
    if (gameType !== null) {
      params.push(gameType);
      typeFilter = `AND game_type = $${params.length}`;
    }
    const query = `DELETE FROM games WHERE game_id = $1 AND team_id = $2 ${typeFilter} RETURNING *`;
    const { rows } = await pool.query(query, params);
    return rows[0];
  }
}

module.exports = Game;
