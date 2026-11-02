const express = require('express');
const router = express.Router();
const {
  getAllContests,
  getContestById,
  createContest,
  joinContest,
  leaveContest,
  getMyStatus,
  getParticipants,
  getStandings,
  getAvailableTeams,
  submitPick,
  getWeekPicks,
  getMyPicks,
  cancelPick,
  getLockStatus,
  getWeeklySchedule,
  startContest,
  getWeeks,
  updateWeeks,
  setupWeekSchedule,
  updateWeekLockTime,
  updateAllWeekLockTimes,
  processWeekResults,
  checkWeekReadiness,
  advanceWeek,
  checkAutoAdvance,
  getTiebreakerStatus,
  getTiebreakerAvailableTeams,
  submitTiebreakerPick,
  getTiebreakerPicks,
  processTiebreakerResults,
  advanceTiebreakerGame
} = require('../controllers/survivorController');
const { protect, requireAdmin } = require('../middleware/authMiddleware');

router.use(protect);
router.use(require('../middleware/contestRateLimiter'));

/**
 * Survivor Contest Routes
 * Base path: /api/survivor
 */

// Protected routes - Get contests
router.get('/contests', getAllContests);
router.get('/contests/:id', getContestById);
router.get('/contests/:id/participants', getParticipants);
router.get('/contests/:id/standings', getStandings);
router.get('/contests/:id/lock-status', getLockStatus);
router.get('/contests/:id/week/:week/schedule', getWeeklySchedule);

// Admin only - Create and manage contests
router.post('/contests', requireAdmin, createContest);
router.post('/contests/:id/start', requireAdmin, startContest);
router.get('/contests/:id/weeks', getWeeks);
router.put('/contests/:id/weeks', requireAdmin, updateWeeks);
router.post('/contests/:id/weeks/:weekNumber/setup', requireAdmin, setupWeekSchedule);
router.post('/contests/:id/weeks/:weekNumber/update-lock-time', requireAdmin, updateWeekLockTime);
router.post('/contests/:id/update-all-lock-times', requireAdmin, updateAllWeekLockTimes);

// Week results and advancement
router.post('/contests/:id/weeks/:weekNumber/process-results', requireAdmin, processWeekResults);
router.get('/contests/:id/weeks/:weekNumber/readiness', requireAdmin, checkWeekReadiness);
router.post('/contests/:id/advance-week', requireAdmin, advanceWeek);

// Auto-advance check (manual trigger for testing)
router.post('/auto-advance/check', requireAdmin, checkAutoAdvance);

// Protected routes - Contest participation
router.post('/contests/:id/join', joinContest);
router.post('/contests/:id/leave', leaveContest);
router.get('/contests/:id/my-status', getMyStatus);

// Protected routes - Picks management
router.get('/contests/:id/available-teams', getAvailableTeams);
router.post('/contests/:id/picks', submitPick);
router.get('/contests/:id/picks', getWeekPicks);
router.get('/contests/:id/my-picks', getMyPicks);
router.delete('/contests/:id/picks/:week', cancelPick);

// Tiebreaker routes
router.get('/contests/:id/tiebreaker/status', getTiebreakerStatus);
router.get('/contests/:id/tiebreaker/available-teams', getTiebreakerAvailableTeams);
router.post('/contests/:id/tiebreaker/picks', submitTiebreakerPick);
router.get('/contests/:id/tiebreaker/picks', getTiebreakerPicks);
router.post('/contests/:id/tiebreaker/process-results', requireAdmin, processTiebreakerResults);
router.post('/contests/:id/tiebreaker/advance-game', requireAdmin, advanceTiebreakerGame);

module.exports = router;
