const Game = require('../models/Game');
const pool = require('../config/database');

/**
 * Get all games grouped by date
 * @route GET /api/games
 * @access Private/Admin
 */
const getAllGames = async (req, res, next) => {
  try {
    const games = await Game.findGroupedByDate();
    
    res.status(200).json({
      success: true,
      data: games
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get games by date range
 * @route GET /api/games/range?start=YYYY-MM-DD&end=YYYY-MM-DD
 * @access Private/Admin
 */
const getGamesByDateRange = async (req, res, next) => {
  try {
    const { start, end } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: 'Please provide start and end dates'
      });
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start) || !dateRegex.test(end) || isNaN(Date.parse(start)) || isNaN(Date.parse(end))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }
    
    const games = await Game.findByDateRange(start, end);
    
    res.status(200).json({
      success: true,
      data: games
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get games by specific date
 * @route GET /api/games/date/:date
 * @access Private/Admin
 */
const getGamesByDate = async (req, res, next) => {
  try {
    const { date } = req.params;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a date'
      });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date) || isNaN(Date.parse(date))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }
    
    const games = await Game.findByDate(date);
    
    res.status(200).json({
      success: true,
      data: games
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific game
 * @route GET /api/games/:gameId/:teamId
 * @access Private/Admin
 */
const getGame = async (req, res, next) => {
  try {
    const { gameId, teamId } = req.params;
    
    const game = await Game.findById(gameId, teamId);
    
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: game
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update game score
 * @route PUT /api/games/:gameId/:teamId
 * @access Private/Admin
 */
const updateGameScore = async (req, res, next) => {
  try {
    const { gameId, teamId } = req.params;
    const { team_score, opponent_score, result, game_state } = req.body;
    
    // Validate scores
    if (team_score !== undefined && (!Number.isInteger(team_score) || team_score < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Team score must be a non-negative number'
      });
    }
    
    if (opponent_score !== undefined && (!Number.isInteger(opponent_score) || opponent_score < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Opponent score must be a non-negative number'
      });
    }
    
    // Validate result
    if (result && !['W', 'L', 'OTL', 'SOL'].includes(result)) {
      return res.status(400).json({
        success: false,
        message: 'Result must be one of: W, L, OTL, SOL'
      });
    }
    
    // Check if game exists
    const existingGame = await Game.findById(gameId, teamId);
    if (!existingGame) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }
    
    // Calculate inverse result for opponent's perspective
    const opponentId = existingGame.opponent_id;
    let opponentResult = null;
    if (result === 'W') {
      opponentResult = 'L';
    } else if (result === 'L') {
      opponentResult = 'W';
    } else if (result === 'OTL') {
      opponentResult = 'W';
    } else if (result === 'SOL') {
      opponentResult = 'W';
    }

    // Update both rows in a transaction for consistency
    const client = await pool.connect();
    let updatedGame;
    try {
      await client.query('BEGIN');
      
      // Update the primary game row
      const primaryResult = await client.query(
        `UPDATE games
         SET team_score = COALESCE($3, team_score),
             opponent_score = COALESCE($4, opponent_score),
             result = COALESCE($5, result),
             game_state = COALESCE($6, game_state),
             score_overridden = TRUE,
             updated_at = CURRENT_TIMESTAMP
         WHERE game_id = $1 AND team_id = $2
         RETURNING *`,
        [gameId, teamId, team_score, opponent_score, result, game_state || 'FINAL']
      );
      updatedGame = primaryResult.rows[0];
      
      // Update the mirror row with swapped scores and inverse result
      const mirrorResult = await client.query(
        `UPDATE games
         SET team_score = COALESCE($3, team_score),
             opponent_score = COALESCE($4, opponent_score),
             result = COALESCE($5, result),
             game_state = COALESCE($6, game_state),
             score_overridden = TRUE,
             updated_at = CURRENT_TIMESTAMP
         WHERE game_id = $1 AND team_id = $2`,
        [gameId, opponentId, opponent_score, team_score, opponentResult, game_state || 'FINAL']
      );
      
      // If mirror row doesn't exist, insert it
      if (mirrorResult.rowCount === 0) {
        await client.query(
          `INSERT INTO games (game_id, team_id, team_abbrev, opponent_id, opponent_abbrev, game_date, game_type, is_home, team_score, opponent_score, result, game_state, score_overridden, start_time_utc, series_id, round, game_number_in_series, updated_at)
           SELECT $1, $2, t2.abbreviation, $3, t1.abbreviation, g.game_date, g.game_type, NOT g.is_home, g.opponent_score, g.team_score,
             CASE WHEN g.result = 'W' THEN 'L' WHEN g.result IN ('L','OTL','SOL') THEN 'W' ELSE g.result END,
             g.game_state, TRUE, g.start_time_utc, g.series_id, g.round, g.game_number_in_series, CURRENT_TIMESTAMP
           FROM games g
           LEFT JOIN nhl_teams t1 ON t1.team_id = $3
           LEFT JOIN nhl_teams t2 ON t2.team_id = $2
           WHERE g.game_id = $1 AND g.team_id = $3`,
          [gameId, opponentId, parseInt(teamId)]
        );
      }
      
      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
    
    await require('../services/NhlService').refreshStandingsAndPicks();
    res.status(200).json({
      success: true,
      message: 'Game scores updated successfully for both teams',
      data: updatedGame
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create or update a game
 * @route POST /api/games
 * @access Private/Admin
 */
const upsertGame = async (req, res, next) => {
  try {
    const gameData = req.body;
    
    // Validate required fields
    const requiredFields = [
      'game_id', 'game_date', 'team_id', 'team_abbrev',
      'opponent_id', 'opponent_abbrev', 'is_home'
    ];
    
    for (const field of requiredFields) {
      if (gameData[field] === undefined || gameData[field] === null) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`
        });
      }
    }
    
    // Set defaults
    gameData.game_type = gameData.game_type || 2; // Default to regular season
    gameData.game_state = gameData.game_state || 'FINAL';
    gameData.team_score = gameData.team_score || 0;
    gameData.opponent_score = gameData.opponent_score || 0;
    gameData.result = gameData.result || 'L';
    
    const game = await Game.upsert(gameData);
    
    res.status(201).json({
      success: true,
      message: 'Game saved successfully',
      data: game
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a game
 * @route DELETE /api/games/:gameId/:teamId
 * @access Private/Admin
 */
const deleteGame = async (req, res, next) => {
  try {
    const { gameId, teamId } = req.params;
    
    // Check if game exists
    const game = await Game.findById(gameId, teamId);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }
    
    // Delete game
    await Game.delete(gameId, teamId);
    
    res.status(200).json({
      success: true,
      message: 'Game deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllGames,
  getGamesByDateRange,
  getGamesByDate,
  getGame,
  updateGameScore,
  upsertGame,
  deleteGame
};
