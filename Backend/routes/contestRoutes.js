const express = require('express');
const router = express.Router();
const {
  getDivisions,
  getDivisionsByConference,
  getTeams,
  getTeamById,
  getTeamsByDivision,
  getTeamsByConference,
  getLatestStats,
  getStatsByDate,
  getTeamStatsHistory,
  updateDailyStats,
  getParticipants,
  getParticipantById,
  createParticipant,
  updateParticipant,
  deleteParticipant,
  getAllPicks,
  getPickByParticipant,
  createPick,
  updatePick,
  deletePick,
  getLeaderboard,
  getAvailableTeams,
  recalculateAllPicks,
  getAllContests,
  getContestById,
  getActiveContest,
  createContest,
  adminAddParticipant,
  joinContest,
  leaveContest,
  startContestDrafting,
  getCurrentDraftPick,
  makeDraftPick,
  completeContest,
  updateContest,
  deleteContest,
  getDashboardAnalytics
} = require('../controllers/contestController');
const { protect, requireAdmin } = require('../middleware/authMiddleware');

router.use(protect);
router.use(require('../middleware/contestRateLimiter'));

// Protected routes - Divisions
router.get('/divisions', getDivisions);
router.get('/divisions/conference/:conferenceName', getDivisionsByConference);

// Protected routes - Teams
router.get('/teams', getTeams);
router.get('/teams/:teamId', getTeamById);
router.get('/teams/division/:divisionId', getTeamsByDivision);
router.get('/teams/conference/:conferenceName', getTeamsByConference);

// Protected routes - Stats
router.get('/stats/latest', getLatestStats);
router.get('/stats/date/:date', getStatsByDate);
router.get('/stats/team/:teamId/history', getTeamStatsHistory);

// Admin only - Update stats
router.post('/stats/update', requireAdmin, updateDailyStats);

// Protected routes - Analytics
router.get('/analytics', getDashboardAnalytics);

// Protected routes - Participants
router.get('/participants', getParticipants);
router.get('/participants/:participantId', getParticipantById);

// Admin only - Manage participants
router.post('/participants', requireAdmin, createParticipant);
router.put('/participants/:participantId', requireAdmin, updateParticipant);
router.delete('/participants/:participantId', requireAdmin, deleteParticipant);

// Protected routes - Picks and Leaderboard
router.get('/picks', getAllPicks);
router.get('/picks/participant/:participantId', getPickByParticipant);
router.get('/picks/available-teams', getAvailableTeams);
router.get('/leaderboard', getLeaderboard);

// Protected routes - Create/manage picks (players and admins)
router.post('/picks', requireAdmin, createPick);

// Admin only - Update/delete picks and recalculate
router.put('/picks/:pickId', requireAdmin, updatePick);
router.delete('/picks/:pickId', requireAdmin, deletePick);
router.post('/picks/recalculate', requireAdmin, recalculateAllPicks);

// Contest routes
router.get('/contests', getAllContests);
router.get('/contests/active/:contestType', getActiveContest);
router.get('/contests/:contestId', getContestById);
router.post('/contests', requireAdmin, createContest);
router.put('/contests/:contestId', requireAdmin, updateContest);
router.delete('/contests/:contestId', requireAdmin, deleteContest);

// Contest participation
router.post('/contests/:contestId/join', joinContest);
router.delete('/contests/:contestId/leave', leaveContest);

// Admin: Add participant to contest with team picks
router.post('/contests/:contestId/admin/add-participant', requireAdmin, adminAddParticipant);

// Contest management (admin)
router.post('/contests/:contestId/start', requireAdmin, startContestDrafting);
router.post('/contests/:contestId/complete', requireAdmin, completeContest);

// Draft routes
router.get('/contests/:contestId/draft/current', getCurrentDraftPick);
router.post('/contests/:contestId/draft/pick', makeDraftPick);

module.exports = router;

