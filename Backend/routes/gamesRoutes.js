const express = require('express');
const router = express.Router();
const {
  getAllGames,
  getGamesByDateRange,
  getGamesByDate,
  getGame,
  updateGameScore,
  upsertGame,
  deleteGame
} = require('../controllers/gamesController');
const { protect, requireAdmin } = require('../middleware/authMiddleware');

// All routes require authentication and admin role
router.use(protect);
router.use(require('../middleware/contestRateLimiter'));
router.use(requireAdmin);

// Game management routes
router.get('/', getAllGames); // Get all games grouped by date
router.get('/range', getGamesByDateRange); // Get games by date range
router.get('/date/:date', getGamesByDate); // Get games by specific date
router.get('/:gameId/:teamId', getGame); // Get specific game
router.put('/:gameId/:teamId', updateGameScore); // Update game score
router.post('/', upsertGame); // Create or update game
router.delete('/:gameId/:teamId', deleteGame); // Delete game

module.exports = router;
