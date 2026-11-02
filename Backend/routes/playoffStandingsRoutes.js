const express = require('express');
const router = express.Router();
const playoffStandingsController = require('../controllers/playoffStandingsController');
const { protect, requireAdmin } = require('../middleware/authMiddleware');

// All routes require authentication and admin role
router.use(protect);
router.use(requireAdmin);

// GET /api/playoff-standings - Get playoff standings
router.get('/', playoffStandingsController.getPlayoffStandings);

// GET /api/playoff-standings/teams - Get only playoff teams
router.get('/teams', playoffStandingsController.getPlayoffTeams);

// GET /api/playoff-standings/dates - Get available dates
router.get('/dates', playoffStandingsController.getAvailableDates);

// GET /api/playoff-standings/auto-update/settings - Get auto-update settings
router.get('/auto-update/settings', playoffStandingsController.getAutoUpdateSettings);

// PUT /api/playoff-standings/auto-update/settings - Update auto-update settings
router.put('/auto-update/settings', playoffStandingsController.updateAutoUpdateSettings);

// POST /api/playoff-standings/auto-update/check - Check and run auto-update if needed
router.post('/auto-update/check', playoffStandingsController.checkAndRunAutoUpdate);

// POST /api/playoff-standings/update - Trigger Python backend update
router.post('/update', playoffStandingsController.triggerUpdate);

// PUT /api/playoff-standings/:standingsId - Update a standing record
router.put('/:standingsId', playoffStandingsController.updateStanding);

// DELETE /api/playoff-standings/:date - Delete standings for a date
router.delete('/:date', playoffStandingsController.deleteStandings);

module.exports = router;

