const asyncHandler = require('express-async-handler');
const Division = require('../models/Division');
const NhlTeam = require('../models/NhlTeam');
const TeamStandings = require('../models/TeamStandings');
const Game = require('../models/Game');
const PoolParticipant = require('../models/PoolParticipant');
const TwoTeamPick = require('../models/TwoTeamPick');
const Contest = require('../models/Contest');
const Settings = require('../models/Settings');
const pool = require('../config/database');

// @desc    Get all divisions
// @route   GET /api/contest/divisions
// @access  Public
const getDivisions = asyncHandler(async (req, res) => {
  const divisions = await Division.findAll();
  res.json(divisions);
});

// @desc    Get divisions by conference
// @route   GET /api/contest/divisions/conference/:conferenceName
// @access  Public
const getDivisionsByConference = asyncHandler(async (req, res) => {
  const { conferenceName } = req.params;
  const divisions = await Division.findByConference(conferenceName);
  res.json(divisions);
});

// @desc    Get all NHL teams
// @route   GET /api/contest/teams
// @access  Public
const getTeams = asyncHandler(async (req, res) => {
  const teams = await NhlTeam.findAll();
  res.json(teams);
});

// @desc    Get team by ID
// @route   GET /api/contest/teams/:teamId
// @access  Public
const getTeamById = asyncHandler(async (req, res) => {
  const { teamId } = req.params;
  const team = await NhlTeam.findById(teamId);
  
  if (!team) {
    res.status(404);
    throw new Error('Team not found');
  }
  
  res.json(team);
});

// @desc    Get teams by division
// @route   GET /api/contest/teams/division/:divisionId
// @access  Public
const getTeamsByDivision = asyncHandler(async (req, res) => {
  const { divisionId } = req.params;
  const teams = await NhlTeam.findByDivision(divisionId);
  res.json(teams);
});

// @desc    Get teams by conference
// @route   GET /api/contest/teams/conference/:conferenceName
// @access  Public
const getTeamsByConference = asyncHandler(async (req, res) => {
  const { conferenceName } = req.params;
  const teams = await NhlTeam.findByConference(conferenceName);
  res.json(teams);
});

// @desc    Get latest stats for all teams
// @route   GET /api/contest/stats/latest
// @access  Public
const getLatestStats = asyncHandler(async (req, res) => {
  const stats = await TeamStandings.findAllWithDetails();
  res.json(stats);
});

// @desc    Get stats by date (DEPRECATED - returns current standings)
// @route   GET /api/contest/stats/date/:date
// @access  Public
const getStatsByDate = asyncHandler(async (req, res) => {
  // Since we moved from daily_stats to team_standings materialized view,
  // we no longer have historical snapshots by date.
  // Return current standings instead.
  const stats = await TeamStandings.findAllWithDetails();
  res.json(stats);
});

// @desc    Get stats history for a team (based on games)
// @route   GET /api/contest/stats/team/:teamId/history
// @access  Public
const getTeamStatsHistory = asyncHandler(async (req, res) => {
  const { teamId } = req.params;
  const { startDate, endDate } = req.query;
  // Get games for the team
  const games = await Game.findByTeam(teamId, startDate, endDate);
  res.json(games);
});

// @desc    Refresh team Standings and recalculate picks
// @route   POST /api/contest/stats/update
// @access  Admin
const updateDailyStats = asyncHandler(async (req, res) => {
  // Refresh the materialized view to get latest Standings from games table
  await TeamStandings.refresh();
  
  // After refreshing Standings, recalculate all pick totals
  await TwoTeamPick.calculateAndUpdateAllWins();
  
  // Also recalculate playoff picks
  const PlayoffPick = require('../models/PlayoffPick');
  await PlayoffPick.calculateAndUpdateAllWins();
  
  // Get updated standings
  const stats = await TeamStandings.findAllWithDetails();
  
  res.json({
    message: 'Team standings and playoff picks refreshed and recalculated successfully',
    stats
  });
});

// @desc    Get all participants
// @route   GET /api/contest/participants
// @access  Public
const getParticipants = asyncHandler(async (req, res) => {
  const { contest_id } = req.query;
  const participants = await PoolParticipant.findAll(contest_id ? parseInt(contest_id) : null);
  res.json(participants);
});

// @desc    Get participant by ID
// @route   GET /api/contest/participants/:participantId
// @access  Public
const getParticipantById = asyncHandler(async (req, res) => {
  const { participantId } = req.params;
  const participant = await PoolParticipant.findById(participantId);
  
  if (!participant) {
    res.status(404);
    throw new Error('Participant not found');
  }
  
  res.json(participant);
});

// @desc    Create a new participant
// @route   POST /api/contest/participants
// @access  Admin
const createParticipant = asyncHandler(async (req, res) => {
  const { participant_name, draft_order, user_id, contest_id } = req.body;
  
  if (!participant_name || !draft_order) {
    res.status(400);
    throw new Error('Participant name and draft order are required');
  }
  
  // Check if draft order is between 1 and 16
  if (draft_order < 1 || draft_order > 16) {
    res.status(400);
    throw new Error('Draft order must be between 1 and 16');
  }
  
  // Check if draft order is available (scoped to contest)
  const isAvailable = await PoolParticipant.isDraftOrderAvailable(draft_order, contest_id || null);
  if (!isAvailable) {
    res.status(400);
    throw new Error('Draft order is already taken');
  }
  
  const participant = await PoolParticipant.create(participant_name, draft_order, user_id, contest_id);
  
  res.status(201).json(participant);
});

// @desc    Update participant
// @route   PUT /api/contest/participants/:participantId
// @access  Admin
const updateParticipant = asyncHandler(async (req, res) => {
  const { participantId } = req.params;
  const updateData = req.body;
  
  // Check if participant exists
  const existingParticipant = await PoolParticipant.findById(participantId);
  if (!existingParticipant) {
    res.status(404);
    throw new Error('Participant not found');
  }
  
  // If updating draft order, check if it's available (scoped to contest)
  if (updateData.draft_order) {
    const isAvailable = await PoolParticipant.isDraftOrderAvailable(
      updateData.draft_order, 
      existingParticipant.contest_id,
      participantId
    );
    if (!isAvailable) {
      res.status(400);
      throw new Error('Draft order is already taken');
    }
  }
  
  const participant = await PoolParticipant.update(participantId, updateData);
  res.json(participant);
});

// @desc    Delete participant
// @route   DELETE /api/contest/participants/:participantId
// @access  Admin
const deleteParticipant = asyncHandler(async (req, res) => {
  const { participantId } = req.params;
  
  const participant = await PoolParticipant.delete(participantId);
  
  if (!participant) {
    res.status(404);
    throw new Error('Participant not found');
  }
  
  res.json({ message: 'Participant deleted successfully' });
});

// @desc    Get all two-team picks
// @route   GET /api/contest/picks
// @access  Public
const getAllPicks = asyncHandler(async (req, res) => {
  const { contest_id } = req.query;
  const picks = await TwoTeamPick.findAll(contest_id ? parseInt(contest_id) : null);
  res.json(picks);
});

// @desc    Get pick by participant ID
// @route   GET /api/contest/picks/participant/:participantId
// @access  Public
const getPickByParticipant = asyncHandler(async (req, res) => {
  const { participantId } = req.params;
  const pick = await TwoTeamPick.findByParticipantId(participantId);
  
  if (!pick) {
    res.status(404);
    throw new Error('Pick not found for this participant');
  }
  
  res.json(pick);
});

// @desc    Create a new pick
// @route   POST /api/contest/picks
// @access  Player/Admin
const createPick = asyncHandler(async (req, res) => {
  const { participant_id, team1_id, team2_id } = req.body;
  
  if (!participant_id || !team1_id || !team2_id) {
    res.status(400);
    throw new Error('Participant ID and both team IDs are required');
  }
  
  // Validate teams are different
  if (team1_id === team2_id) {
    res.status(400);
    throw new Error('Cannot pick the same team twice');
  }
  
  // Check if participant exists
  const participant = await PoolParticipant.findById(participant_id);
  if (!participant) {
    res.status(404);
    throw new Error('Participant not found');
  }
  
  // Check if participant already has a pick
  const existingPick = await TwoTeamPick.findByParticipantId(participant_id);
  if (existingPick) {
    res.status(400);
    throw new Error('Participant already has a pick');
  }
  
  const pick = await TwoTeamPick.create(participant_id, team1_id, team2_id, participant.contest_id);
  
  // Calculate initial wins
  await TwoTeamPick.calculateAndUpdateWins(participant_id);
  
  // Get the updated pick with all details
  const updatedPick = await TwoTeamPick.findByParticipantId(participant_id);
  
  res.status(201).json(updatedPick);
});

// @desc    Update a pick
// @route   PUT /api/contest/picks/:pickId
// @access  Admin
const updatePick = asyncHandler(async (req, res) => {
  const { pickId } = req.params;
  const { team1_id, team2_id } = req.body;
  
  if (!team1_id || !team2_id) {
    res.status(400);
    throw new Error('Both team IDs are required');
  }
  
  // Validate teams are different
  if (team1_id === team2_id) {
    res.status(400);
    throw new Error('Cannot pick the same team twice');
  }
  
  // Check if pick exists
  const existingPick = await TwoTeamPick.findById(pickId);
  if (!existingPick) {
    res.status(404);
    throw new Error('Pick not found');
  }
  
  await TwoTeamPick.update(pickId, team1_id, team2_id);
  
  // Recalculate wins
  await TwoTeamPick.calculateAndUpdateWins(existingPick.participant_id);
  
  // Get the updated pick with all details
  const updatedPick = await TwoTeamPick.findById(pickId);
  
  res.json(updatedPick);
});

// @desc    Delete a pick
// @route   DELETE /api/contest/picks/:pickId
// @access  Admin
const deletePick = asyncHandler(async (req, res) => {
  const { pickId } = req.params;
  
  const pick = await TwoTeamPick.delete(pickId);
  
  if (!pick) {
    res.status(404);
    throw new Error('Pick not found');
  }
  
  res.json({ message: 'Pick deleted successfully' });
});

// @desc    Get contest leaderboard
// @route   GET /api/contest/leaderboard
// @access  Public
const getLeaderboard = asyncHandler(async (req, res) => {
  const { contest_id } = req.query;
  
  if (!contest_id) {
    res.status(400);
    throw new Error('Contest ID is required');
  }

  const contestId = parseInt(contest_id);
  const contest = await Contest.findById(contestId);

  if (!contest) {
    res.status(404);
    throw new Error('Contest not found');
  }

  // For playoff tiebreaker contests, get playoff leaderboard
  if (contest.is_tiebreaker && contest.contest_type === 'playoff_tiebreaker') {
    const PlayoffPick = require('../models/PlayoffPick');
    const leaderboard = await PlayoffPick.getLeaderboard(contestId);
    res.json(leaderboard);
  } else {
    // For regular two-team contests
    const leaderboard = await TwoTeamPick.getLeaderboard(contestId);
    res.json(leaderboard);
  }
});

// @desc    Get available teams for picking
// @route   GET /api/contest/picks/available-teams
// @access  Public
const getAvailableTeams = asyncHandler(async (req, res) => {
  const { contest_id } = req.query;
  
  if (!contest_id) {
    res.status(400);
    throw new Error('Contest ID is required');
  }

  const contestId = parseInt(contest_id);
  const contest = await Contest.findById(contestId);

  if (!contest) {
    res.status(404);
    throw new Error('Contest not found');
  }

  // For playoff tiebreaker contests, get playoff teams
  if (contest.is_tiebreaker && contest.contest_type === 'playoff_tiebreaker') {
    const PlayoffPick = require('../models/PlayoffPick');
    const teams = await PlayoffPick.getAvailableTeams(contestId);
    res.json(teams);
  } else {
    // For regular two-team contests, get all NHL teams
    const teams = await TwoTeamPick.getAvailableTeams(contestId);
    res.json(teams);
  }
});

// @desc    Recalculate all pick totals
// @route   POST /api/contest/picks/recalculate
// @access  Admin
const recalculateAllPicks = asyncHandler(async (req, res) => {
  const twoTeamPicks = await TwoTeamPick.calculateAndUpdateAllWins();
  
  const PlayoffPick = require('../models/PlayoffPick');
  const playoffPicks = await PlayoffPick.calculateAndUpdateAllWins();
  
  res.json({
    message: 'All picks recalculated successfully',
    twoTeamPicks,
    playoffPicks
  });
});

// @desc    Get all contests
// @route   GET /api/contest/contests
// @access  Public
const getAllContests = asyncHandler(async (req, res) => {
  const contests = await Contest.findAll();
  res.json(contests);
});

// @desc    Get contest by ID
// @route   GET /api/contest/contests/:contestId
// @access  Public
const getContestById = asyncHandler(async (req, res) => {
  const { contestId } = req.params;
  const contest = await Contest.getContestWithParticipants(contestId);
  
  if (!contest) {
    res.status(404);
    throw new Error('Contest not found');
  }
  
  res.json(contest);
});

// @desc    Get active contest
// @route   GET /api/contest/contests/active/:contestType
// @access  Public
const getActiveContest = asyncHandler(async (req, res) => {
  const { contestType } = req.params;
  const contest = await Contest.findActive(contestType);
  
  if (!contest) {
    res.status(404);
    throw new Error('No active contest found');
  }
  
  const contestWithDetails = await Contest.getContestWithParticipants(contest.contest_id);
  res.json(contestWithDetails);
});

// @desc    Create a new contest
// @route   POST /api/contest/contests
// @access  Admin
const createContest = asyncHandler(async (req, res) => {
  const { contest_name, season_year, contest_type = 'two_team', max_participants = 16 } = req.body;
  if (contest_type !== 'two_team') {
    res.status(400);
    throw new Error('Use Survivor management to create Survivor contests. Playoff tiebreakers are created from tied results.');
  }
  if (!Number.isInteger(max_participants) || max_participants < 2 || max_participants > 16) {
    res.status(400);
    throw new Error('Two-Team contests require 2 to 16 participants.');
  }
  
  if (!contest_name || !season_year) {
    res.status(400);
    throw new Error('Contest name and season year are required');
  }
  
  const contest = await Contest.create(contest_name, season_year, contest_type, max_participants);
  res.status(201).json(contest);
});

// @desc    Admin: Add participant to contest with team picks
// @route   POST /api/contest/contests/:contestId/admin/add-participant
// @access  Admin
const adminAddParticipant = asyncHandler(async (req, res) => {
  const { contestId } = req.params;
  const { user_id, participant_name, team1_id, team2_id } = req.body;
  
  const pool = require('../config/database');
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Validate input
    if (!user_id || !team1_id || !team2_id) {
      await client.query('ROLLBACK');
      res.status(400);
      throw new Error('User ID, Team 1, and Team 2 are required');
    }
    
    if (team1_id === team2_id) {
      await client.query('ROLLBACK');
      res.status(400);
      throw new Error('Team 1 and Team 2 must be different');
    }
    
    // Lock the contest row
    const contestQuery = 'SELECT * FROM contests WHERE contest_id = $1 FOR UPDATE';
    const { rows: contestRows } = await client.query(contestQuery, [contestId]);
    const contest = contestRows[0];
    
    if (!contest) {
      await client.query('ROLLBACK');
      res.status(404);
      throw new Error('Contest not found');
    }
    
    if (contest.contest_type !== 'two_team') {
      await client.query('ROLLBACK');
      res.status(400);
      throw new Error('This endpoint is only for two-team contests');
    }
    
    // Get user details
    const User = require('../models/User');
    const user = await User.findById(user_id);
    if (!user) {
      await client.query('ROLLBACK');
      res.status(404);
      throw new Error('User not found');
    }
    
    // Check if user already joined this contest
    const existingQuery = 'SELECT * FROM pool_participants WHERE user_id = $1 AND contest_id = $2';
    const { rows: existing } = await client.query(existingQuery, [user_id, contestId]);
    if (existing.length > 0) {
      await client.query('ROLLBACK');
      res.status(400);
      throw new Error('User has already joined this contest');
    }
    
    // Check if teams are already picked
    const team1PickedQuery = `
      SELECT COUNT(*) as count FROM two_team_picks 
      WHERE contest_id = $1 AND (team1_id = $2 OR team2_id = $2)
    `;
    const { rows: team1Rows } = await client.query(team1PickedQuery, [contestId, team1_id]);
    if (parseInt(team1Rows[0].count) > 0) {
      await client.query('ROLLBACK');
      res.status(400);
      throw new Error('Team 1 has already been picked in this contest');
    }
    
    const team2PickedQuery = `
      SELECT COUNT(*) as count FROM two_team_picks 
      WHERE contest_id = $1 AND (team1_id = $2 OR team2_id = $2)
    `;
    const { rows: team2Rows } = await client.query(team2PickedQuery, [contestId, team2_id]);
    if (parseInt(team2Rows[0].count) > 0) {
      await client.query('ROLLBACK');
      res.status(400);
      throw new Error('Team 2 has already been picked in this contest');
    }
    
    // Get the current count of participants for this contest
    const countQuery = 'SELECT COUNT(*) FILTER (WHERE active) as count, COALESCE(MAX(draft_order), 0) + 1 AS next_order FROM pool_participants WHERE contest_id = $1';
    const { rows: countRows } = await client.query(countQuery, [contestId]);
    const currentCount = parseInt(countRows[0].count);

    if (currentCount >= contest.max_participants) {
      res.status(400);
      throw new Error('Contest is full');
    }
    
    // Use provided name or user's name
    const name = participant_name || user.name || user.email;
    
    // Calculate draft order based on current count
    const draftOrder = countRows[0].next_order;
    
    // Create participant
    const insertParticipantQuery = `
      INSERT INTO pool_participants (participant_name, draft_order, user_id, contest_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const { rows: participantRows } = await client.query(insertParticipantQuery, [name, draftOrder, user_id, contestId]);
    const participant = participantRows[0];
    
    // Create team picks
    const insertPickQuery = `
      INSERT INTO two_team_picks (participant_id, team1_id, team2_id, contest_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const { rows: pickRows } = await client.query(insertPickQuery, [participant.participant_id, team1_id, team2_id, contestId]);
    const pick = pickRows[0];
    
    // Update participant count
    const updateQuery = `
      UPDATE contests 
      SET draft_order = CASE WHEN status = 'waiting' THEN NULL ELSE draft_order END, current_participants = (
        SELECT COUNT(*) FROM pool_participants 
        WHERE contest_id = $1 AND active = TRUE
      )
      WHERE contest_id = $1
      RETURNING *
    `;
    const { rows: updatedContestRows } = await client.query(updateQuery, [contestId]);
    const updatedContest = updatedContestRows[0];
    
    await client.query('COMMIT');
    
    const contestWithDetails = await Contest.getContestWithParticipants(contestId);
    
    res.status(201).json({
      success: true,
      message: 'Participant added successfully',
      participant,
      pick,
      contest: contestWithDetails
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// @desc    Join a contest
// @route   POST /api/contest/contests/:contestId/join
// @access  Protected
const joinContest = asyncHandler(async (req, res) => {
  const { contestId } = req.params;
  const userId = req.user.id;
  const { participant_name } = req.body;
  
  const pool = require('../config/database');
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Lock the contest row to prevent race conditions
    const contestQuery = 'SELECT * FROM contests WHERE contest_id = $1 FOR UPDATE';
    const { rows: contestRows } = await client.query(contestQuery, [contestId]);
    const contest = contestRows[0];
    
    if (!contest) {
      await client.query('ROLLBACK');
      res.status(404);
      throw new Error('Contest not found');
    }
    
    if (contest.status !== 'waiting' || contest.contest_type !== 'two_team') {
      await client.query('ROLLBACK');
      res.status(400);
      throw new Error('Contest is not accepting new participants');
    }
    
    // Check if user already joined this contest
    const existingQuery = 'SELECT * FROM pool_participants WHERE user_id = $1 AND contest_id = $2';
    const { rows: existing } = await client.query(existingQuery, [userId, contestId]);
    if (existing.length > 0) {
      await client.query('ROLLBACK');
      res.status(400);
      throw new Error('You have already joined this contest');
    }
    
    // Get the current count of participants for this contest
    const countQuery = 'SELECT COUNT(*) FILTER (WHERE active) as count, COALESCE(MAX(draft_order), 0) + 1 AS next_order FROM pool_participants WHERE contest_id = $1';
    const { rows: countRows } = await client.query(countQuery, [contestId]);
    const currentCount = parseInt(countRows[0].count);
    
    // Check if contest is full
    if (currentCount >= contest.max_participants) {
      await client.query('ROLLBACK');
      res.status(400);
      throw new Error('Contest is full');
    }
    
    // Use provided name or user's name
    const name = participant_name || req.user.name || req.user.email;
    
    // Calculate draft order based on current count
    const tempDraftOrder = countRows[0].next_order;
    
    // Create participant
    const insertQuery = `
      INSERT INTO pool_participants (participant_name, draft_order, user_id, contest_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const { rows: participantRows } = await client.query(insertQuery, [name, tempDraftOrder, userId, contestId]);
    const participant = participantRows[0];
    
    // Update participant count
    const updateQuery = `
      UPDATE contests 
      SET draft_order = NULL, current_participants = (
        SELECT COUNT(*) FROM pool_participants 
        WHERE contest_id = $1 AND active = TRUE
      )
      WHERE contest_id = $1
      RETURNING *
    `;
    const { rows: updatedContestRows } = await client.query(updateQuery, [contestId]);
    const updatedContest = updatedContestRows[0];
    
    // Check if contest is full and auto-start if needed
    if (updatedContest.current_participants >= updatedContest.max_participants) {
      await Contest.startDrafting(contestId, client);
    }
    await client.query('COMMIT');
    
    const contestWithDetails = await Contest.getContestWithParticipants(contestId);
    
    res.status(201).json({
      participant,
      contest: contestWithDetails
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// @desc    Leave a contest
// @route   DELETE /api/contest/contests/:contestId/leave
// @access  Protected
const leaveContest = asyncHandler(async (req, res) => {
  const { contestId } = req.params;
  const userId = req.user.id;
  
  const contest = await Contest.findById(contestId);
  
  if (!contest) {
    res.status(404);
    throw new Error('Contest not found');
  }
  
  if (contest.status !== 'waiting') {
    res.status(400);
    throw new Error('Cannot leave contest that has already started');
  }
  
  const participant = await PoolParticipant.removeFromContest(userId, contestId);
  
  if (!participant) {
    res.status(404);
    throw new Error('You are not a participant in this contest');
  }
  
  // Update participant count
  await Contest.updateParticipantCount(contestId);
  
  res.json({ message: 'Successfully left the contest' });
});

// @desc    Start contest drafting
// @route   POST /api/contest/contests/:contestId/start
// @access  Admin
const startContestDrafting = asyncHandler(async (req, res) => {
  const { contestId } = req.params;
  
  const contest = await Contest.startDrafting(contestId);
  const contestWithDetails = await Contest.getContestWithParticipants(contestId);
  
  res.json(contestWithDetails);
});

// @desc    Get current draft pick
// @route   GET /api/contest/contests/:contestId/draft/current
// @access  Public
const getCurrentDraftPick = asyncHandler(async (req, res) => {
  const { contestId } = req.params;
  
  const pickInfo = await Contest.getCurrentDraftPick(contestId);
  
  if (!pickInfo) {
    res.status(404);
    throw new Error('No active draft pick');
  }
  
  res.json(pickInfo);
});

// @desc    Make a draft pick
// @route   POST /api/contest/contests/:contestId/draft/pick
// @access  Protected
const makeDraftPick = asyncHandler(async (req, res) => {
  try {
    const result = await Contest.makeDraftPick(
      req.params.contestId, req.user.id, Number(req.body.team_id), req.user.role === 'admin'
    );
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 400);
    throw error;
  }
});

// @desc    Complete contest
// @route   POST /api/contest/contests/:contestId/complete
// @access  Admin
const completeContest = asyncHandler(async (req, res) => {
  const { contestId } = req.params;
  
  const contest = await Contest.complete(contestId);
  res.json(contest);
});

// @desc    Update contest details
// @route   PUT /api/contest/contests/:contestId
// @access  Admin
const updateContest = asyncHandler(async (req, res) => {
  const { contestId } = req.params;
  const { contest_name, season_year, max_participants } = req.body;
  
  const contest = await Contest.findById(contestId);
  
  if (!contest) {
    res.status(404);
    throw new Error('Contest not found');
  }
  
  if (contest.status !== 'waiting') {
    res.status(400);
    throw new Error('Can only edit contests in waiting status');
  }
  
  if (max_participants !== undefined && (!Number.isInteger(max_participants) || max_participants < 2 || (contest.contest_type === 'two_team' && max_participants > 16))) {
    res.status(400);
    throw new Error('Invalid participant limit. Two-Team contests support 2 to 16 participants.');
  }
  // Validate max_participants
  if (max_participants && max_participants < contest.current_participants) {
    res.status(400);
    throw new Error(`Cannot set max participants below current participant count (${contest.current_participants})`);
  }
  
  const updateData = {};
  if (contest_name) updateData.contest_name = contest_name;
  if (season_year) updateData.season_year = season_year;
  if (max_participants) updateData.max_participants = max_participants;
  
  const updatedContest = await Contest.update(contestId, updateData);
  res.json(updatedContest);
});

// @desc    Delete contest
// @route   DELETE /api/contest/contests/:contestId
// @access  Admin
const deleteContest = asyncHandler(async (req, res) => {
  const { contestId } = req.params;
  
  const contest = await Contest.delete(contestId);
  
  if (!contest) {
    res.status(404);
    throw new Error('Contest not found');
  }
  
  res.json({ message: 'Contest deleted successfully' });
});

// @desc    Get dashboard analytics (for authenticated users)
// @route   GET /api/contest/analytics
// @access  Protected
const getDashboardAnalytics = asyncHandler(async (req, res) => {
  const current = await Contest.getCurrentSurvivorWeek();
  const { current_week: currentWeek, start_date: weekStartStr, end_date: weekEndStr } = current;

    // Count unique games this week (by game_id only, not duplicated by team)
  // game_type: 2 = Regular Season, 3 = Playoffs
  const gamesQuery = `
    SELECT COUNT(DISTINCT game_id) as count
    FROM games
    WHERE game_date >= $1 AND game_date <= $2
    AND game_type = 2
  `;
  const gamesResult = await pool.query(gamesQuery, [weekStartStr, weekEndStr]);
  const gamesThisWeek = parseInt(gamesResult.rows[0]?.count) || 0;
  
  // Get survivor stats - count active participants in survivor contests
  // Use the new survivor_participants table
  const survivorQuery = `
    SELECT COUNT(DISTINCT sp.id) as alive_count
    FROM survivor_participants sp
    JOIN contests c ON sp.contest_id = c.contest_id
    WHERE sp.is_eliminated = false 
    AND c.contest_type = 'survivor'
    AND c.contest_id = $1
  `;
  const survivorResult = await pool.query(survivorQuery, [current.contest_id || null]);
  const survivorAlive = parseInt(survivorResult.rows[0]?.alive_count) || 0;
  
  // Get total participants in survivor contests
  const totalParticipantsQuery = `
    SELECT COUNT(DISTINCT sp.id) as total
    FROM survivor_participants sp
    JOIN contests c ON sp.contest_id = c.contest_id
    WHERE c.contest_type = 'survivor'
    AND c.contest_id = $1
  `;
  const totalParticipantsResult = await pool.query(totalParticipantsQuery, [current.contest_id || null]);
  const totalParticipants = parseInt(totalParticipantsResult.rows[0]?.total) || 0;
  
  // Get two-team contest leader
  // First check if there's an active or completed playoff tiebreaker contest (most recent)
  const tiebreakerCheckQuery = `
    SELECT contest_id, status
    FROM contests 
    WHERE contest_type = 'playoff_tiebreaker' 
    AND status IN ('drafting', 'in_progress', 'completed')
    ORDER BY 
      CASE 
        WHEN status = 'in_progress' THEN 1
        WHEN status = 'drafting' THEN 2
        WHEN status = 'completed' THEN 3
      END,
      completed_at DESC,
      created_at DESC
    LIMIT 1
  `;
  const tiebreakerCheck = await pool.query(tiebreakerCheckQuery);
  
  let leader;
  if (tiebreakerCheck.rows.length > 0) {
    // Get leader from playoff picks
    const playoffLeaderQuery = `
      SELECT 
        pp.participant_name,
        COALESCE(plp.total_playoff_wins, 0) as wins
      FROM pool_participants pp
      LEFT JOIN playoff_picks plp ON pp.participant_id = plp.participant_id
      WHERE pp.contest_id = $1
      ORDER BY wins DESC
      LIMIT 1
    `;
    const leaderResult = await pool.query(playoffLeaderQuery, [tiebreakerCheck.rows[0].contest_id]);
    leader = leaderResult.rows[0] || { participant_name: 'N/A', wins: 0 };
  } else {
    // Get leader from regular two-team picks (most recent active or completed contest)
    const contestCheckQuery = `
      SELECT contest_id
      FROM contests
      WHERE contest_type = 'two_team'
      AND status IN ('in_progress', 'completed')
      ORDER BY 
        CASE 
          WHEN status = 'in_progress' THEN 1
          WHEN status = 'completed' THEN 2
        END,
        completed_at DESC,
        created_at DESC
      LIMIT 1
    `;
    const contestCheck = await pool.query(contestCheckQuery);
    
    if (contestCheck.rows.length > 0) {
      const leaderQuery = `
        SELECT 
          pp.participant_name,
          COALESCE(ttp.total_wins, 0) as wins
        FROM pool_participants pp
        LEFT JOIN two_team_picks ttp ON pp.participant_id = ttp.participant_id
        WHERE pp.contest_id = $1
        ORDER BY wins DESC
        LIMIT 1
      `;
      const leaderResult = await pool.query(leaderQuery, [contestCheck.rows[0].contest_id]);
      leader = leaderResult.rows[0] || { participant_name: 'N/A', wins: 0 };
    } else {
      // Fallback to any participant
      const leaderQuery = `
        SELECT 
          pp.participant_name,
          COALESCE(ttp.total_wins, 0) as wins
        FROM pool_participants pp
        LEFT JOIN two_team_picks ttp ON pp.participant_id = ttp.participant_id
        ORDER BY wins DESC
        LIMIT 1
      `;
      const leaderResult = await pool.query(leaderQuery);
      leader = leaderResult.rows[0] || { participant_name: 'N/A', wins: 0 };
    }
  }
  
  const SurvivorService = require('../services/survivorService');
  const deadline = current.contest_id && current.status === 'in_progress'
    ? await (current.phase === 'playoff_tiebreaker'
      ? SurvivorService.getTiebreakerStatus(current.contest_id)
      : SurvivorService.getWeekStatus(current.contest_id, currentWeek)) : null;
  const nextDeadline = deadline?.lock_time || null;

  res.status(200).json({
    success: true,
    data: {
      currentWeek,
      seasonYear: current.season_year || null,
      phase: current.phase || null,
      playoffRound: deadline?.current_round || null,
      playoffGame: deadline?.current_game_number || null,
      contestStatus: current.status || null,
      gamesThisWeek,
      survivorAlive,
      totalParticipants,
      leader: {
        name: leader.participant_name,
        wins: parseInt(leader.wins) || 0
      },
      nextDeadline
    }
  });
});

module.exports = {
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
};
