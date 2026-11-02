const User = require('../models/User');
const Settings = require('../models/Settings');
const { ROLES } = require('../config/roles');
const pool = require('../config/database');
const schedulerService = require('../services/schedulerService');
const nhlService = require('../services/NhlService');

const adminAddSurvivorPick = async (req, res, next) => {
  try {
    const result = await require('../services/survivorService').addAdminPick(req.params.id, req.body);
    res.status(201).json({ success: true, ...result });
  } catch (error) { res.status(400); next(error); }
};

const adminImportSurvivorPick = async (req, res, next) => {
  try {
    const imported = await require('../services/survivorService').importHistoricalPick(req.params.id, req.body);
    res.status(201).json({ success: true, ...imported });
  } catch (error) { res.status(400); next(error); }
};

const adminGetSurvivorPicks = async (req, res, next) => {
  try {
    if (req.query.round !== undefined) {
      const { rows } = await pool.query(`SELECT p.*, p.pick_id AS id, p.picked_team_id AS team_id,
        p.picked_team_abbrev AS abbreviation, sp.participant_name,
        CASE WHEN p.is_correct IS NULL THEN 'pending' WHEN p.is_correct THEN 'survived' ELSE 'eliminated' END AS result
        FROM survivor_playoff_tiebreaker_picks p
        JOIN survivor_playoff_tiebreaker_participants tp USING (tiebreaker_participant_id)
        JOIN survivor_participants sp ON sp.id = tp.participant_id
        WHERE p.contest_id = $1 AND p.round = $2 AND p.game_number = $3 ORDER BY sp.participant_name`,
      [req.params.id, req.query.round, req.query.game]);
      return res.json({ picks: rows });
    }
    const { rows } = await pool.query(`SELECT p.*, sp.participant_name, t.abbreviation, t.team_name
      FROM survivor_picks p JOIN survivor_participants sp ON sp.id = p.participant_id
      JOIN nhl_teams t ON t.team_id = p.team_id WHERE p.contest_id = $1 AND p.week_number = $2
      ORDER BY sp.participant_name`, [req.params.id, req.query.week]);
    res.json({ picks: rows });
  } catch (error) { next(error); }
};

/**
 * Get all users
 * @route GET /api/admin/users
 * @access Private/Admin
 */
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.findAll();
    
    // Format users for response
    const formattedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      lastName: user.last_name,
      role: user.role,
      active: user.active,
      created_at: user.created_at,
      updated_at: user.updated_at
    }));
    
    res.status(200).json({
      success: true,
      users: formattedUsers
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new user (Admin only)
 * @route POST /api/admin/users
 * @access Private/Admin
 */
const createUser = async (req, res, next) => {
  try {
    const { email, password, name, lastName, role } = req.body;
    
    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, password, and name'
      });
    }
    
    // Check password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Create new user with player role by default
    const user = await User.create({
      email,
      password,
      name,
      lastName: lastName || '',
      role: role || ROLES.PLAYER
    });
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        lastName: user.last_name,
        role: user.role,
        active: user.active
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a user
 * @route DELETE /api/admin/users/:id
 * @access Private/Admin
 */
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Don't allow admin to delete themselves
    if (parseInt(id) === req.userId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }
    
    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Delete user
    const deleted = await User.delete(id);
    
    if (!deleted) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete user'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user
 * @route PUT /api/admin/users/:id
 * @access Private/Admin
 */
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, password, name, lastName, role } = req.body;
    
    // Validate that we have something to update
    if (!email && !password && !name && !lastName && !role) {
      return res.status(400).json({
        success: false,
        message: 'No data provided to update'
      });
    }
    
    // Check if user exists
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // If email is being updated, check if it's already taken
    if (email && email.toLowerCase() !== existingUser.email.toLowerCase()) {
      const emailExists = await User.findByEmail(email);
      if (emailExists) {
        return res.status(409).json({
          success: false,
          message: 'Email already exists'
        });
      }
    }
    
    // Build update object
    const updateData = {};
    if (email) updateData.email = email.toLowerCase();
    if (name) updateData.name = name;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (role) updateData.role = role;
    
    // Handle password update separately (not in ALLOWED_FIELDS whitelist)
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters long'
        });
      }
      const bcrypt = require('bcrypt');
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(password, salt);
      await User.updatePassword(id, hashedPassword);
    }
    
    // Update other user fields (admin can also set role)
    const updatedUser = await User.adminUpdate(id, updateData);
    
    if (!updatedUser) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update user'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        lastName: updatedUser.last_name,
        role: updatedUser.role,
        active: updatedUser.active
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user status (activate/deactivate)
 * @route PATCH /api/admin/users/:id/status
 * @access Private/Admin
 */
const updateUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { active } = req.body;
    
    if (typeof active !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Active status must be a boolean value'
      });
    }
    
    // Don't allow admin to deactivate themselves
    if (parseInt(id) === req.userId && !active) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account'
      });
    }
    
    // Update user
    const updatedUser = await User.update(id, { active });
    
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'User status updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        active: updatedUser.active
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all settings
 * @route GET /api/admin/settings
 * @access Private/Admin
 */
const getSettings = async (req, res, next) => {
  try {
    const settings = await Settings.getAll();
    
    res.status(200).json({
      success: true,
      settings
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update settings
 * @route PUT /api/admin/settings
 * @access Private/Admin
 */
const updateSettings = async (req, res, next) => {
  try {
    const settingsData = req.body;
    
    // Validate that we have settings to update
    if (!settingsData || Object.keys(settingsData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No settings provided to update'
      });
    }
    
    // Update settings
    const result = await Settings.updateMultiple(settingsData);
    
    const response = {
      success: true,
      message: result.skippedKeys.length > 0
        ? `Settings updated. Skipped invalid keys: ${result.skippedKeys.join(', ')}`
        : 'Settings updated successfully',
      settings: result.updated
    };
    
    if (result.skippedKeys.length > 0) {
      response.skippedKeys = result.skippedKeys;
    }
    
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Get dashboard analytics
 * @route GET /api/admin/analytics
 * @access Private/Admin
 */
const getDashboardAnalytics = async (req, res, next) => {
  try {
    const { current_week: currentWeek, start_date: weekStartStr, end_date: weekEndStr } =
      await require('../models/Contest').getCurrentSurvivorWeek();

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
    
    console.log('Analytics - Games This Week:', gamesThisWeek);
    
    // Get survivor stats - count active participants in survivor contests
    // Use the new survivor_participants table
    const survivorQuery = `
      SELECT COUNT(DISTINCT sp.id) as alive_count
      FROM survivor_participants sp
      JOIN contests c ON sp.contest_id = c.contest_id
      WHERE sp.is_eliminated = false 
      AND c.contest_type = 'survivor'
      AND c.status IN ('active', 'in_progress', 'waiting')
    `;
    const survivorResult = await pool.query(survivorQuery);
    const survivorAlive = parseInt(survivorResult.rows[0]?.alive_count) || 0;
    
    // Get total participants in survivor contests
    const totalParticipantsQuery = `
      SELECT COUNT(DISTINCT sp.id) as total
      FROM survivor_participants sp
      JOIN contests c ON sp.contest_id = c.contest_id
      WHERE c.contest_type = 'survivor'
      AND c.status IN ('active', 'in_progress', 'waiting')
    `;
    const totalParticipantsResult = await pool.query(totalParticipantsQuery);
    const totalParticipants = parseInt(totalParticipantsResult.rows[0]?.total) || 0;
    
    // Get two-team contest leader
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
    const leader = leaderResult.rows[0] || { participant_name: 'N/A', wins: 0 };
    
    // Get next real deadline from active survivor weeks
    const deadlineQuery = `
      SELECT sw.lock_time
      FROM survivor_weeks sw
      JOIN contests c ON sw.contest_id = c.contest_id
      WHERE c.status IN ('active', 'in_progress')
      AND c.contest_type = 'survivor'
      AND sw.lock_time > NOW()
      ORDER BY sw.lock_time ASC
      LIMIT 1
    `;
    const deadlineResult = await pool.query(deadlineQuery);
    const nextDeadline = deadlineResult.rows[0]?.lock_time || null;
    
    res.status(200).json({
      success: true,
      data: {
        currentWeek,
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
  } catch (error) {
    next(error);
  }
};

/**
 * Get scheduler status
 * @route GET /api/admin/scheduler/status
 * @access Private/Admin
 */
const getSchedulerStatus = async (req, res, next) => {
  try {
    const status = schedulerService.getStatus();
    
    res.status(200).json({
      success: true,
      scheduler: status
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Trigger immediate data fetch for all endpoints
 * @route POST /api/admin/data/fetch-now
 * @access Private/Admin
 */
const triggerImmediateDataFetch = async (req, res, next) => {
  try {
    const result = await schedulerService.triggerImmediateDataFetch();
    
    res.status(200).json({
      success: true,
      message: 'Immediate data fetch completed',
      result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Purge all games and re-fetch from season start
 * @route POST /api/admin/data/purge-and-refetch
 * @access Private/Admin
 */
const purgeAndRefetchGames = async (req, res, next) => {
  try {
    console.log('🔧 [MANUAL] Purge and re-fetch triggered by admin');
    const result = await nhlService.purgeAndRefetchGames();
    
    res.status(200).json({
      success: true,
      message: 'All games purged and re-fetched from season start',
      result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Trigger historical data fetch from season start
 * @route POST /api/admin/data/fetch-historical
 * @access Private/Admin
 */
const triggerHistoricalDataFetch = async (req, res, next) => {
  try {
    const result = await schedulerService.triggerHistoricalDataFetch();
    
    res.status(200).json({
      success: true,
      message: 'Historical data fetch completed',
      result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Trigger recent days data fetch
 * @route POST /api/admin/data/fetch-recent
 * @access Private/Admin
 */
const triggerRecentDaysFetch = async (req, res, next) => {
  try {
    const { days } = req.body;
    const daysToFetch = days || 7;
    
    if (daysToFetch < 1 || daysToFetch > 365) {
      return res.status(400).json({
        success: false,
        message: 'Days must be between 1 and 365'
      });
    }
    
    const result = await schedulerService.triggerRecentDaysFetch(daysToFetch);
    
    res.status(200).json({
      success: true,
      message: `Recent ${daysToFetch} days data fetch completed`,
      result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check NHL API health
 * @route GET /api/admin/data/api-health
 * @access Private/Admin
 */
const checkNhlApiHealth = async (req, res, next) => {
  try {
    const health = await nhlService.checkHealth();
    
    res.status(200).json({
      success: true,
      nhlApi: health
    });
  } catch (error) {
    next(error);
  }
};

// ===========================================================================
//  SURVIVOR ADMIN OVERRIDE ENDPOINTS
// ===========================================================================

/**
 * Override a survivor regular-season pick
 * @route PUT /api/admin/survivor/contests/:id/picks/:pickId
 * @access Private/Admin
 */
const adminUpdateSurvivorPick = async (req, res, next) => {
  try {
    const { id: contestId, pickId } = req.params;
    const { team_id, result, games_won, games_needed } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify pick exists and belongs to contest
      await client.query('SELECT contest_id FROM contests WHERE contest_id = $1 FOR UPDATE', [contestId]);
      const pickRes = await client.query(
        'SELECT * FROM survivor_picks WHERE id = $1 AND contest_id = $2',
        [pickId, contestId]
      );
      if (pickRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Pick not found' });
      }
      const oldPick = pickRes.rows[0];

      // Build dynamic SET clause
      const sets = [];
      const vals = [];
      let idx = 1;

      if (team_id !== undefined) {
        // Validate team exists
        const teamRes = await client.query('SELECT team_id FROM nhl_teams WHERE team_id = $1', [team_id]);
        if (teamRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Invalid team_id' });
        }
        sets.push(`team_id = $${idx++}`);
        vals.push(team_id);
        if (Number(team_id) !== oldPick.team_id) {
          const used = await client.query('SELECT 1 FROM survivor_team_usage WHERE contest_id = $1 AND user_id = $2 AND team_id = $3 AND used_in_week <> $4',
            [contestId, oldPick.user_id, team_id, oldPick.week_number]);
          if (used.rows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Participant already used this team in another week' });
          }
          if (result === undefined) sets.push("result = 'pending'", 'result_override = NULL');
          if (games_won === undefined) sets.push('games_won_override = NULL');
          if (games_needed === undefined) sets.push('games_needed_override = NULL');
        }
      }
      if (result !== undefined) {
        const validResults = ['pending', 'survived', 'eliminated'];
        if (!validResults.includes(result)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `result must be one of: ${validResults.join(', ')}` });
        }
        sets.push(`result = $${idx++}`);
        vals.push(result);
        sets.push(`result_override = $${idx++}`);
        vals.push(result === 'pending' ? null : result);
      }
      for (const [field, value] of Object.entries({ games_won, games_needed })) {
        if (value === undefined) continue;
        if (value !== null && (!Number.isInteger(value) || value < 0 || (field === 'games_needed' && ![1, 2].includes(value)))) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Wins must be a non-negative integer; required wins must be 1 or 2' });
        }
        sets.push(`${field}_override = $${idx++}`); vals.push(value);
      }

      if (sets.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'No fields to update' });
      }

      sets.push(`updated_at = CURRENT_TIMESTAMP`);
      vals.push(pickId, contestId);

      const updated = await client.query(
        `UPDATE survivor_picks SET ${sets.join(', ')} WHERE id = $${idx++} AND contest_id = $${idx++} RETURNING *`,
        vals
      );

      // If team changed, update survivor_team_usage
      if (team_id !== undefined && team_id !== oldPick.team_id) {
        await client.query(
          'UPDATE survivor_team_usage SET team_id = $1 WHERE contest_id = $2 AND user_id = $3 AND team_id = $4 AND used_in_week = $5',
          [team_id, contestId, oldPick.user_id, oldPick.team_id, oldPick.week_number]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, pick: updated.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Force eliminate or reinstate a survivor participant
 * @route PATCH /api/admin/survivor/contests/:id/participants/:participantId
 * @access Private/Admin
 */
const adminUpdateParticipantStatus = async (req, res, next) => {
  const { id: contestId, participantId } = req.params;
  const { is_eliminated, elimination_week, placement } = req.body;
  if (typeof is_eliminated !== 'boolean') return res.status(400).json({ success: false, message: 'is_eliminated (boolean) is required' });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT contest_id FROM contests WHERE contest_id = $1 FOR UPDATE', [contestId]);
    const { rows } = await client.query(`UPDATE survivor_participants SET is_eliminated = $1,
      elimination_week = $2, elimination_round = NULL, placement = $3
      WHERE id = $4 AND contest_id = $5 RETURNING *`,
    [is_eliminated, is_eliminated ? elimination_week || null : null, is_eliminated ? placement || null : null, participantId, contestId]);
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Participant not found' });
    }
    await client.query(`UPDATE survivor_playoff_tiebreaker_participants SET is_eliminated = $1,
      eliminated_at = CASE WHEN $1 THEN NOW() ELSE NULL END, eliminated_in_round = NULL,
      eliminated_in_game_number = NULL, is_winner = FALSE, won_at = NULL
      WHERE participant_id = $2 AND contest_id = $3`, [is_eliminated, participantId, contestId]);
    await client.query('COMMIT');
    res.json({ success: true, participant: rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    next(error);
  } finally { if (client) client.release(); }
};
/**
 * Override a tiebreaker pick or force-eliminate/reinstate tiebreaker participant
 * @route PUT /api/admin/survivor/contests/:id/tiebreaker/picks/:pickId
 * @access Private/Admin
 */
const adminUpdateTiebreakerPick = async (req, res, next) => {
  try {
    const { id: contestId, pickId } = req.params;
    const { is_correct, picked_team_id, eliminate_participant, reinstate_participant } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify pick exists
      await client.query('SELECT contest_id FROM contests WHERE contest_id = $1 FOR UPDATE', [contestId]);
      const pickRes = await client.query(
        'SELECT p.*, tp.tiebreaker_participant_id FROM survivor_playoff_tiebreaker_picks p JOIN survivor_playoff_tiebreaker_participants tp ON p.tiebreaker_participant_id = tp.tiebreaker_participant_id WHERE p.pick_id = $1 AND p.contest_id = $2',
        [pickId, contestId]
      );
      if (pickRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Tiebreaker pick not found' });
      }
      const pick = pickRes.rows[0];

      // Update pick fields
      const sets = [];
      const vals = [];
      let idx = 1;

      if (is_correct !== undefined) {
        if (is_correct !== null && typeof is_correct !== 'boolean') {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'is_correct must be true, false, or null to restore automatic scoring' });
        }
        sets.push(`is_correct = $${idx++}`);
        vals.push(is_correct);
        sets.push(`is_correct_override = $${idx++}`);
        vals.push(is_correct);
      }
      if (picked_team_id !== undefined) {
        const teamRes = await client.query(`SELECT t.abbreviation, ps.series_id, s.current_round
          FROM playoff_series ps JOIN survivor_playoff_tiebreaker_status s ON s.season = ps.season
          JOIN nhl_teams t ON t.team_id IN (ps.top_seed_team_id, ps.bottom_seed_team_id)
          WHERE s.contest_id = $1 AND ps.round = $2 AND t.team_id = $3`, [contestId, pick.round, picked_team_id]);
        if (teamRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Team must play in this contest season and round' });
        }
        const used = await client.query(`SELECT 1 FROM survivor_playoff_tiebreaker_team_usage
          WHERE tiebreaker_participant_id = $1 AND team_id = $2 AND pick_id <> $3
            AND CASE WHEN $4 <= 2 THEN used_in_round <= 2 ELSE used_in_round = 3 END`,
        [pick.tiebreaker_participant_id, picked_team_id, pickId, pick.round]);
        if (pick.round !== 4 && used.rows.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Participant already used this team in this phase' });
        }
        sets.push(`series_id = $${idx++}`); vals.push(teamRes.rows[0].series_id);
        sets.push('game_id = NULL');
        if (is_correct === undefined) sets.push('is_correct = NULL', 'is_correct_override = NULL');
        sets.push(`picked_team_id = $${idx++}`);
        vals.push(picked_team_id);
        sets.push(`picked_team_abbrev = $${idx++}`);
        vals.push(teamRes.rows[0].abbreviation);
        await client.query('DELETE FROM survivor_playoff_tiebreaker_team_usage WHERE pick_id = $1', [pickId]);
        if (pick.round !== 4) {
          const currentRound = teamRes.rows[0].current_round;
          await client.query(`INSERT INTO survivor_playoff_tiebreaker_team_usage
            (tiebreaker_participant_id, contest_id, team_id, team_abbrev, used_in_round, used_in_game_number, pick_id, counts_as_used)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [pick.tiebreaker_participant_id, contestId, picked_team_id,
            teamRes.rows[0].abbreviation, pick.round, pick.game_number, pickId,
            currentRound <= 2 ? pick.round <= 2 : currentRound === 3 && pick.round === 3]);
        }
      }

      let updatedPick = pick;
      if (sets.length > 0) {
        sets.push(`updated_at = CURRENT_TIMESTAMP`);
        vals.push(pickId);
        const updateRes = await client.query(
          `UPDATE survivor_playoff_tiebreaker_picks SET ${sets.join(', ')} WHERE pick_id = $${idx++} RETURNING *`,
          vals
        );
        updatedPick = updateRes.rows[0];
      }

      // Force eliminate participant
      let participantUpdate = null;
      if (eliminate_participant) {
        const elimRes = await client.query(
          `UPDATE survivor_playoff_tiebreaker_participants
           SET is_eliminated = TRUE, eliminated_at = NOW(),
               eliminated_in_round = $1, eliminated_in_game_number = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE tiebreaker_participant_id = $3 RETURNING *`,
          [pick.round, pick.game_number, pick.tiebreaker_participant_id]
        );
        participantUpdate = elimRes.rows[0];
      } else if (reinstate_participant) {
        const reinstateRes = await client.query(
          `UPDATE survivor_playoff_tiebreaker_participants
           SET is_eliminated = FALSE, eliminated_at = NULL,
               eliminated_in_round = NULL, eliminated_in_game_number = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE tiebreaker_participant_id = $1 RETURNING *`,
          [pick.tiebreaker_participant_id]
        );
        participantUpdate = reinstateRes.rows[0];
      }

      if (participantUpdate) {
        await client.query(`UPDATE survivor_playoff_tiebreaker_participants SET is_winner = FALSE, won_at = NULL
          WHERE tiebreaker_participant_id = $1`, [pick.tiebreaker_participant_id]);
        await client.query(`UPDATE survivor_participants sp SET is_eliminated = tp.is_eliminated,
          elimination_round = tp.eliminated_in_round, placement = NULL
          FROM survivor_playoff_tiebreaker_participants tp
          WHERE tp.tiebreaker_participant_id = $1 AND sp.id = tp.participant_id`, [pick.tiebreaker_participant_id]);
      }

      await client.query('COMMIT');
      res.json({ success: true, pick: updatedPick, participant: participantUpdate });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Override contest phase/status/week
 * @route PATCH /api/admin/survivor/contests/:id/state
 * @access Private/Admin
 */
const adminUpdateContestState = async (req, res, next) => {
  try {
    const { id: contestId } = req.params;
    const { phase, status, current_week, playoff_round, playoff_game_number } = req.body;

    // Validate enum values
    if (phase !== undefined) {
      const validPhases = ['regular_season', 'playoff_tiebreaker', 'completed'];
      if (!validPhases.includes(phase)) {
        return res.status(400).json({ success: false, message: `phase must be one of: ${validPhases.join(', ')}` });
      }
    }
    if (status !== undefined) {
      const validStatuses = ['in_progress', 'waiting', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: `status must be one of: ${validStatuses.join(', ')}` });
      }
    }
    if (current_week !== undefined) {
      const week = await pool.query('SELECT 1 FROM survivor_weeks WHERE contest_id = $1 AND week_number = $2', [contestId, current_week]);
      if (!Number.isInteger(current_week) || !week.rows.length) {
        return res.status(400).json({ success: false, message: 'Choose an existing contest week' });
      }
    }
    if (playoff_round !== undefined && (playoff_round < 1 || playoff_round > 4)) {
      return res.status(400).json({ success: false, message: 'playoff_round must be 1-4' });
    }
    if (playoff_game_number !== undefined && (playoff_game_number < 1 || playoff_game_number > 7)) {
      return res.status(400).json({ success: false, message: 'playoff_game_number must be 1-7' });
    }

    // Verify contest exists
    const contestRes = await pool.query('SELECT * FROM contests WHERE contest_id = $1', [contestId]);
    if (contestRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Contest not found' });
    }

    const sets = [];
    const vals = [];
    let idx = 1;

    if (phase !== undefined) { sets.push(`phase = $${idx++}`); vals.push(phase); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); vals.push(status); }
    if (current_week !== undefined) { sets.push(`current_week = $${idx++}`); vals.push(current_week); }
    if (playoff_round !== undefined) { sets.push(`playoff_round = $${idx++}`); vals.push(playoff_round); }
    if (playoff_game_number !== undefined) { sets.push(`playoff_game_number = $${idx++}`); vals.push(playoff_game_number); }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    sets.push(`updated_at = NOW()`);
    vals.push(contestId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT contest_id FROM contests WHERE contest_id = $1 FOR UPDATE', [contestId]);
      const result = await client.query(
        `UPDATE contests SET ${sets.join(', ')} WHERE contest_id = $${idx++} RETURNING *`, vals);
      const contest = result.rows[0];
      if (contest.status === 'in_progress' && contestRes.rows[0].status === 'completed') {
        await client.query('UPDATE survivor_playoff_tiebreaker_participants SET is_winner = FALSE, won_at = NULL WHERE contest_id = $1', [contestId]);
        await client.query('UPDATE survivor_participants SET placement = NULL WHERE contest_id = $1 AND is_eliminated = FALSE', [contestId]);
      }
      if (contest.phase === 'playoff_tiebreaker') {
        await require('../services/survivorService').initializeTiebreaker(contestId, client);
        const round = contest.playoff_round || 1;
        const game = contest.playoff_game_number || 1;
        if (round < 4 && game > 4) throw new Error('Rounds 1–3 only use Games 1–4');
        await client.query(`UPDATE survivor_playoff_tiebreaker_status SET current_round = $1,
          current_game_number = $2, max_game_number_for_round = $3, is_active = $4 WHERE contest_id = $5`,
        [round, game, round === 4 ? 7 : 4, contest.status === 'in_progress', contestId]);
        await client.query(`UPDATE survivor_playoff_tiebreaker_team_usage SET counts_as_used =
          ($2 <> 4 AND (used_in_round < $2 OR (used_in_round = $2 AND used_in_game_number <= $3))
            AND ($2 < 3 OR used_in_round >= 3)) WHERE contest_id = $1`, [contestId, round, game]);
      } else {
        await client.query('UPDATE survivor_playoff_tiebreaker_status SET is_active = FALSE WHERE contest_id = $1', [contestId]);
      }
      await client.query('COMMIT');
      res.json({ success: true, contest });
    } catch (error) {
      await client.query('ROLLBACK'); throw error;
    } finally { client.release(); }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  adminAddSurvivorPick,
  adminImportSurvivorPick,
  adminGetSurvivorPicks,
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
};

