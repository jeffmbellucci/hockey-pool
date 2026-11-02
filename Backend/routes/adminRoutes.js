const express = require('express');
const router = express.Router();
const {
  adminAddSurvivorPick,
  adminGetSurvivorPicks,
  adminImportSurvivorPick,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  updateUserStatus,
  getSettings,
  updateSettings,
  getDashboardAnalytics,
  getSchedulerStatus,
  triggerImmediateDataFetch,
  triggerHistoricalDataFetch,
  triggerRecentDaysFetch,
  purgeAndRefetchGames,
  checkNhlApiHealth,
  adminUpdateSurvivorPick,
  adminUpdateParticipantStatus,
  adminUpdateTiebreakerPick,
  adminUpdateContestState
} = require('../controllers/adminController');
const { protect, requireAdmin } = require('../middleware/authMiddleware');

// All routes require authentication and admin role
router.use(protect);
router.use(require('../middleware/contestRateLimiter'));
router.use(requireAdmin);

// User management routes
router.get('/users', getAllUsers);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.patch('/users/:id/status', updateUserStatus);

// Settings routes
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// Analytics routes
router.get('/analytics', getDashboardAnalytics);

// Scheduler and Data Fetch routes
router.get('/scheduler/status', getSchedulerStatus);
router.post('/data/fetch-now', triggerImmediateDataFetch);
router.post('/data/fetch-historical', triggerHistoricalDataFetch);
router.post('/data/fetch-recent', triggerRecentDaysFetch);
router.post('/data/purge-and-refetch', purgeAndRefetchGames);
router.get('/data/api-health', checkNhlApiHealth);

// Survivor admin overrides
router.post('/survivor/contests/:id/import', adminImportSurvivorPick);
router.get('/survivor/contests/:id/picks', adminGetSurvivorPicks);
router.post('/survivor/contests/:id/picks', adminAddSurvivorPick);
router.put('/survivor/contests/:id/picks/:pickId', adminUpdateSurvivorPick);
router.patch('/survivor/contests/:id/participants/:participantId', adminUpdateParticipantStatus);
router.put('/survivor/contests/:id/tiebreaker/picks/:pickId', adminUpdateTiebreakerPick);
router.patch('/survivor/contests/:id/state', adminUpdateContestState);

module.exports = router;

