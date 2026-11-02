const Game = require('../models/Game');

const PLAYOFF_GAME_TYPE = 3;

/**
 * Get all playoff games grouped by date
 * @route GET /api/playoff-games
 * @access Private/Admin
 */
const getAllPlayoffGames = async (req, res, next) => {
  try {
    const games = await Game.findGroupedByDate(PLAYOFF_GAME_TYPE);
    
    res.status(200).json({
      success: true,
      data: games
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get playoff games by date range
 * @route GET /api/playoff-games/range?start=YYYY-MM-DD&end=YYYY-MM-DD
 * @access Private/Admin
 */
const getPlayoffGamesByDateRange = async (req, res, next) => {
  try {
    const { start, end } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: 'Please provide start and end dates'
      });
    }
    
    const games = await Game.findByDateRange(start, end, PLAYOFF_GAME_TYPE);
    
    res.status(200).json({
      success: true,
      data: games
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get playoff games by specific date
 * @route GET /api/playoff-games/date/:date
 * @access Private/Admin
 */
const getPlayoffGamesByDate = async (req, res, next) => {
  try {
    const { date } = req.params;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a date'
      });
    }
    
    const games = await Game.findByDate(date, PLAYOFF_GAME_TYPE);
    
    res.status(200).json({
      success: true,
      data: games
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific playoff game
 * @route GET /api/playoff-games/:gameId/:teamId
 * @access Private/Admin
 */
const getPlayoffGame = async (req, res, next) => {
  try {
    const { gameId, teamId } = req.params;
    
    const game = await Game.findById(gameId, teamId, PLAYOFF_GAME_TYPE);
    
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Playoff game not found'
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
 * Update playoff game score
 * @route PUT /api/playoff-games/:gameId/:teamId
 * @access Private/Admin
 */
const updatePlayoffGameScore = async (req, res, next) => {
  try {
    const game = await Game.findById(req.params.gameId, req.params.teamId, PLAYOFF_GAME_TYPE);
    if (!game) return res.status(404).json({ success: false, message: 'Playoff game not found' });
    return require('./gamesController').updateGameScore(req, res, next);
  } catch (error) { next(error); }
};
/**
 * Create or update a playoff game
 * @route POST /api/playoff-games
 * @access Private/Admin
 */
const upsertPlayoffGame = async (req, res, next) => {
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
    gameData.game_type = gameData.game_type || 3; // Default to playoff
    gameData.game_state = gameData.game_state || 'FINAL';
    gameData.team_score = gameData.team_score || 0;
    gameData.opponent_score = gameData.opponent_score || 0;
    gameData.result = gameData.result || 'L';
    
    const game = await Game.upsert(gameData);
    
    res.status(201).json({
      success: true,
      message: 'Playoff game saved successfully',
      data: game
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a playoff game
 * @route DELETE /api/playoff-games/:gameId/:teamId
 * @access Private/Admin
 */
const deletePlayoffGame = async (req, res, next) => {
  try {
    const { gameId, teamId } = req.params;
    
    // Check if game exists
    const game = await Game.findById(gameId, teamId, PLAYOFF_GAME_TYPE);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Playoff game not found'
      });
    }
    
    // Delete game
    await Game.delete(gameId, teamId, PLAYOFF_GAME_TYPE);
    
    res.status(200).json({
      success: true,
      message: 'Playoff game deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllPlayoffGames,
  getPlayoffGamesByDateRange,
  getPlayoffGamesByDate,
  getPlayoffGame,
  updatePlayoffGameScore,
  upsertPlayoffGame,
  deletePlayoffGame
};
