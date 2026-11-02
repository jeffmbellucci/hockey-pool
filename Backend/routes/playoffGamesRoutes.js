const express = require('express');
const router = express.Router();
const {
  getAllPlayoffGames,
  getPlayoffGamesByDateRange,
  getPlayoffGamesByDate,
  getPlayoffGame,
  updatePlayoffGameScore,
  upsertPlayoffGame,
  deletePlayoffGame
} = require('../controllers/playoffGamesController');
const { protect, requireAdmin } = require('../middleware/authMiddleware');

// All routes require authentication and admin role
router.use(protect);
router.use(requireAdmin);

// Playoff game management routes
router.get('/', getAllPlayoffGames); // Get all playoff games grouped by date
router.get('/range', getPlayoffGamesByDateRange); // Get playoff games by date range
router.get('/date/:date', getPlayoffGamesByDate); // Get playoff games by specific date
router.get('/:gameId/:teamId', getPlayoffGame); // Get specific playoff game
router.put('/:gameId/:teamId', updatePlayoffGameScore); // Update playoff game score
router.post('/', upsertPlayoffGame); // Create or update playoff game
router.delete('/:gameId/:teamId', deletePlayoffGame); // Delete playoff game

module.exports = router;
