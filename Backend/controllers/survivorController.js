const asyncHandler = require('express-async-handler');
const SurvivorService = require('../services/survivorService');

/**
 * Survivor Controller
 * Handles HTTP requests for survivor contest operations
 */

// @desc    Get all survivor contests
// @route   GET /api/survivor/contests
// @access  Public
const getAllContests = asyncHandler(async (req, res) => {
  const contests = await SurvivorService.getAllContests();
  res.json(contests);
});

// @desc    Get contest by ID
// @route   GET /api/survivor/contests/:id
// @access  Public
const getContestById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const contest = await SurvivorService.getContestById(id);
  
  if (!contest) {
    res.status(404);
    throw new Error('Survivor contest not found');
  }
  
  res.json(contest);
});

// @desc    Create new survivor contest
// @route   POST /api/survivor/contests
// @access  Admin
const createContest = asyncHandler(async (req, res) => {
  const { contest_name, season_year, season_start_date, season_end_date, max_participants } = req.body;
  
  if (!contest_name || !season_year || !season_start_date) {
    res.status(400);
    throw new Error('Contest name, season year, and season start date are required');
  }
  
  const contest = await SurvivorService.createContest({
    contest_name,
    season_year,
    season_start_date,
    season_end_date,
    max_participants
  });
  
  res.status(201).json(contest);
});

// @desc    Join a survivor contest
// @route   POST /api/survivor/contests/:id/join
// @access  Protected
const joinContest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { participant_name } = req.body;
  
  // Use provided name or user's name
  const name = participant_name || req.user.name || req.user.email;
  
  try {
    const participant = await SurvivorService.joinContest(id, userId, name);
    const contest = await SurvivorService.getContestById(id);
    
    res.status(201).json({
      participant,
      contest
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Leave a survivor contest
// @route   POST /api/survivor/contests/:id/leave
// @access  Protected
const leaveContest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    await SurvivorService.leaveContest(id, userId);
    res.json({ message: 'Successfully left the contest' });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Get user's status in contest
// @route   GET /api/survivor/contests/:id/my-status
// @access  Protected
const getMyStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  const status = await SurvivorService.getUserStatus(id, userId);
  
  if (!status) {
    res.status(404);
    throw new Error('You are not a participant in this contest');
  }
  
  res.json({
    is_participant: true,
    is_eliminated: status.is_eliminated,
    weeks_survived: parseInt(status.weeks_survived) || 0,
    elimination_week: status.elimination_week,
    placement: status.placement,
    teams_used: parseInt(status.teams_used) || 0,
    teams_remaining: status.teams_remaining,
    current_week: status.current_week,
    phase: status.phase
  });
});

// @desc    Get contest participants
// @route   GET /api/survivor/contests/:id/participants
// @access  Public
const getParticipants = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const participants = await SurvivorService.getContestParticipants(id);
  res.json(participants);
});

// @desc    Get contest standings
// @route   GET /api/survivor/contests/:id/standings
// @access  Public
const getStandings = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const standings = await SurvivorService.getStandings(id);
  res.json(standings);
});

// @desc    Get available teams for current user
// @route   GET /api/survivor/contests/:id/available-teams
// @access  Protected
const getAvailableTeams = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const weekNumber = req.query.week ? parseInt(req.query.week) : null;
  
  try {
    const data = await SurvivorService.getAvailableTeams(id, userId, weekNumber);
    res.json(data);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Submit or update a pick
// @route   POST /api/survivor/contests/:id/picks
// @access  Protected
const submitPick = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { week_number, team_id } = req.body;
  
  if (!week_number || !team_id) {
    res.status(400);
    throw new Error('Week number and team ID are required');
  }
  
  try {
    const result = await SurvivorService.submitPick(id, userId, week_number, team_id);
    res.status(201).json(result);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Get picks for a specific week
// @route   GET /api/survivor/contests/:id/picks
// @access  Protected
const getWeekPicks = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { week } = req.query;
  
  if (!week) {
    res.status(400);
    throw new Error('Week number is required');
  }
  
  try {
    const data = await SurvivorService.getWeekPicks(id, parseInt(week), userId);
    res.json(data);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Get user's pick history
// @route   GET /api/survivor/contests/:id/my-picks
// @access  Protected
const getMyPicks = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  const picks = await SurvivorService.getMyPicks(id, userId);
  res.json(picks);
});

// @desc    Cancel a pick
// @route   DELETE /api/survivor/contests/:id/picks/:week
// @access  Protected
const cancelPick = asyncHandler(async (req, res) => {
  const { id, week } = req.params;
  const userId = req.user.id;
  
  try {
    await SurvivorService.cancelPick(id, userId, parseInt(week));
    res.json({ message: 'Pick cancelled successfully' });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Get lock status for current week
// @route   GET /api/survivor/contests/:id/lock-status
// @access  Public
const getLockStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  try {
    const weekNumber = req.query.week === undefined ? null : Number(req.query.week);
    if (weekNumber !== null && (!Number.isInteger(weekNumber) || weekNumber < 1)) {
      throw new Error('Invalid week');
    }
    const data = await SurvivorService.getLockStatus(id, weekNumber);
    res.json(data);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Get weekly schedule
// @route   GET /api/survivor/contests/:id/week/:week/schedule
// @access  Public
const getWeeklySchedule = asyncHandler(async (req, res) => {
  const { id, week } = req.params;
  
  try {
    const data = await SurvivorService.getWeeklySchedule(id, parseInt(week));
    res.json(data);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Start/Activate a survivor contest
// @route   POST /api/survivor/contests/:id/start
// @access  Admin
const startContest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  try {
    const contest = await SurvivorService.startContest(id, req.body.start_week ?? 1);
    res.json({
      message: 'Contest started successfully',
      contest
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

/**
 * Get all weeks for a contest (admin only)
 */
async function getWeeks(req, res, next) {
  try {
    const contestId = parseInt(req.params.id);
    const weeks = await SurvivorService.getWeeks(contestId);
    
    res.json(weeks);
  } catch (error) {
    next(error);
  }
}

/**
 * Update weeks for a contest (admin only)
 */
async function updateWeeks(req, res, next) {
  try {
    const contestId = parseInt(req.params.id);
    const { weeks } = req.body;
    
    if (!weeks || !Array.isArray(weeks)) {
      return res.status(400).json({ message: 'Invalid weeks data' });
    }
    
    const updatedWeeks = await SurvivorService.updateWeeks(contestId, weeks);
    
    res.json({
      message: 'Weeks updated successfully',
      weeks: updatedWeeks
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Setup week schedule - Fetch games and update lock time
 * POST /api/survivor/contests/:id/weeks/:weekNumber/setup
 */
async function setupWeekSchedule(req, res, next) {
  try {
    const contestId = parseInt(req.params.id);
    const weekNumber = parseInt(req.params.weekNumber);
    
    const result = await SurvivorService.setupWeekSchedule(contestId, weekNumber);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Update lock time for a specific week
 * POST /api/survivor/contests/:id/weeks/:weekNumber/update-lock-time
 */
async function updateWeekLockTime(req, res, next) {
  try {
    const contestId = parseInt(req.params.id);
    const weekNumber = parseInt(req.params.weekNumber);
    
    const result = await SurvivorService.updateWeekLockTime(contestId, weekNumber);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update lock times for all weeks in a contest
 * POST /api/survivor/contests/:id/update-all-lock-times
 */
async function updateAllWeekLockTimes(req, res, next) {
  try {
    const contestId = parseInt(req.params.id);
    
    const result = await SurvivorService.updateAllWeekLockTimes(contestId);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
}

// @desc    Process week results (calculate survivors/eliminations)
// @route   POST /api/survivor/contests/:id/weeks/:weekNumber/process-results
// @access  Admin
const processWeekResults = asyncHandler(async (req, res) => {
  const { id, weekNumber } = req.params;
  
  try {
    const result = await SurvivorService.processWeekResults(id, parseInt(weekNumber));
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Check if week is ready for result processing
// @route   GET /api/survivor/contests/:id/weeks/:weekNumber/readiness
// @access  Admin
const checkWeekReadiness = asyncHandler(async (req, res) => {
  const { id, weekNumber } = req.params;
  
  try {
    const result = await SurvivorService.checkWeekReadiness(id, parseInt(weekNumber));
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Advance contest to next week (processes results + advances)
// @route   POST /api/survivor/contests/:id/advance-week
// @access  Admin
const advanceWeek = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await SurvivorService.advanceWeek(id);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

// @desc    Check and auto-advance weeks for all active contests
// @route   POST /api/survivor/auto-advance/check
// @access  Admin
const checkAutoAdvance = asyncHandler(async (req, res) => {
  try {
    const result = await SurvivorService.checkAndAutoAdvanceWeeks();
    res.json(result);
  } catch (error) {
    res.status(500);
    throw new Error(error.message);
  }
});

// ===========================================================================
//  TIEBREAKER CONTROLLER METHODS
// ===========================================================================

// @desc    Get tiebreaker status for a contest
// @route   GET /api/survivor/contests/:id/tiebreaker/status
// @access  Public
const getTiebreakerStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const status = await SurvivorService.getTiebreakerStatus(id);

  if (!status) {
    return res.json({ active: false, message: 'No tiebreaker active for this contest' });
  }

  res.json(status);
});

// @desc    Get available teams for tiebreaker pick
// @route   GET /api/survivor/contests/:id/tiebreaker/available-teams
// @access  Protected
const getTiebreakerAvailableTeams = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const result = await SurvivorService.getAvailableTeamsForTiebreaker(id, userId);
  res.json(result);
});

// @desc    Submit a tiebreaker pick
// @route   POST /api/survivor/contests/:id/tiebreaker/picks
// @access  Protected
const submitTiebreakerPick = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { series_id, team_id } = req.body;

  if (!series_id || !team_id) {
    res.status(400);
    throw new Error('series_id and team_id are required');
  }

  const pick = await SurvivorService.submitTiebreakerPick(id, userId, series_id, parseInt(team_id));
  res.status(201).json(pick);
});

// @desc    Get tiebreaker picks for a round/game
// @route   GET /api/survivor/contests/:id/tiebreaker/picks
// @access  Protected
const getTiebreakerPicks = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const round = parseInt(req.query.round);
  const game = parseInt(req.query.game);

  if (!round || !game) {
    res.status(400);
    throw new Error('round and game query params are required');
  }

  const result = await SurvivorService.getTiebreakerPicks(id, round, game, userId);
  res.json(result);
});

// @desc    Process tiebreaker game results (admin)
// @route   POST /api/survivor/contests/:id/tiebreaker/process-results
// @access  Admin
const processTiebreakerResults = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await SurvivorService.processTiebreakerGameResults(id);
  res.json({ success: true, ...result });
});

// @desc    Advance tiebreaker to next game/round (admin)
// @route   POST /api/survivor/contests/:id/tiebreaker/advance-game
// @access  Admin
const advanceTiebreakerGame = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await SurvivorService.advanceTiebreakerGame(id);
  res.json({ success: true, ...result });
});

module.exports = {
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
};
