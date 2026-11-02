const pool = require('../config/database');
const notificationService = require('./notificationService');

/**
 * Survivor Service
 * Business logic for survivor contest operations
 */

class SurvivorService {
  // Imports stay in waiting status so scheduled processing cannot evaluate an incomplete roster.
  static async importHistoricalPick(contestId, { user_id, week_number, team_id, submitted_at, result }) {
    if (![user_id, week_number].every(value => Number.isInteger(value) && value > 0)
        || !['pending', 'survived', 'eliminated', 'no_pick'].includes(result)) {
      throw new Error('Choose a user, week, and result');
    }
    const noPick = result === 'no_pick';
    if (!noPick && (!Number.isInteger(team_id) || team_id <= 0 || typeof submitted_at !== 'string'
        || !/(Z|[+-]\d{2}:\d{2})$/.test(submitted_at) || !Number.isFinite(Date.parse(submitted_at)))) {
      throw new Error('Choose a team and the original submission date/time with timezone');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: contests } = await client.query('SELECT * FROM contests WHERE contest_id = $1 FOR UPDATE', [contestId]);
      const contest = contests[0];
      if (!contest || contest.contest_type !== 'survivor' || contest.status !== 'waiting' || contest.phase !== 'regular_season') {
        throw new Error('Historical imports require a waiting regular-season Survivor contest');
      }
      const week = await this.getWeekStatus(contestId, week_number, client);
      if (!week) throw new Error('Choose an existing contest week');
      if (noPick && !week.has_ended) throw new Error('No-pick elimination can only be imported for a finished week');
      if (!noPick) {
        const { rows } = await client.query(`SELECT $1::timestamptz <= clock_timestamp()
          AND $1::timestamptz < (($2::date + 1)::timestamp AT TIME ZONE 'America/New_York') AS valid`,
        [submitted_at, week.end_date]);
        if (!rows[0].valid) throw new Error('The original pick must be in the past and before that week ended');
        const team = await client.query('SELECT 1 FROM nhl_teams WHERE team_id = $1', [team_id]);
        if (!team.rows.length) throw new Error('Team not found');
      }
      const user = await client.query('SELECT name, email FROM users WHERE id = $1 AND active = TRUE', [user_id]);
      if (!user.rows.length) throw new Error('Choose an active user account');
      let { rows: participants } = await client.query('SELECT * FROM survivor_participants WHERE contest_id = $1 AND user_id = $2', [contestId, user_id]);
      if (!participants.length) {
        const count = await client.query('SELECT COUNT(*)::int AS count FROM survivor_participants WHERE contest_id = $1', [contestId]);
        if (count.rows[0].count >= contest.max_participants) throw new Error('Contest is full');
        ({ rows: participants } = await client.query(`INSERT INTO survivor_participants (contest_id, user_id, participant_name)
          VALUES ($1, $2, $3) RETURNING *`, [contestId, user_id, (user.rows[0].name || user.rows[0].email).slice(0, 100)]));
        await client.query(`INSERT INTO user_notification_preferences (user_id, contest_id)
          VALUES ($1, $2) ON CONFLICT (user_id, contest_id) DO NOTHING`, [user_id, contestId]);
      }
      const participant = participants[0];
      if (participant.is_eliminated && (participant.elimination_week == null || week_number > participant.elimination_week)) {
        throw new Error('Cannot import a pick after this participant was eliminated');
      }
      if (participant.is_eliminated && participant.elimination_week === week_number && ['pending', 'survived'].includes(result)) {
        throw new Error('Reinstate this participant before changing their elimination-week result');
      }
      const existing = await client.query('SELECT 1 FROM survivor_picks WHERE contest_id = $1 AND user_id = $2 AND week_number = $3', [contestId, user_id, week_number]);
      if (existing.rows.length) throw new Error('A pick already exists for this week. Use View/Override Picks to correct it');
      if (noPick || result === 'eliminated') {
        const later = await client.query('SELECT 1 FROM survivor_picks WHERE contest_id = $1 AND user_id = $2 AND week_number > $3', [contestId, user_id, week_number]);
        if (later.rows.length) throw new Error('Resolve later picks before importing this elimination');
        await client.query(`UPDATE survivor_participants SET is_eliminated = TRUE, elimination_week = $1
          WHERE id = $2`, [Math.min(participant.elimination_week || week_number, week_number), participant.id]);
      }
      let pick = null;
      if (!noPick) {
        const used = await client.query(`SELECT 1 FROM survivor_team_usage
          WHERE contest_id = $1 AND user_id = $2 AND team_id = $3 AND phase = 'regular_season'`, [contestId, user_id, team_id]);
        if (used.rows.length) throw new Error('This participant already used that team');
        const inserted = await client.query(`INSERT INTO survivor_picks
          (contest_id, participant_id, user_id, week_number, team_id, submitted_at, result, result_override, is_late_pick)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [contestId, participant.id, user_id, week_number, team_id, submitted_at, result,
          result === 'pending' ? null : result, !!week.lock_time && new Date(submitted_at) >= new Date(week.lock_time)]);
        pick = inserted.rows[0];
        await client.query(`INSERT INTO survivor_team_usage (contest_id, user_id, team_id, used_in_week)
          VALUES ($1,$2,$3,$4)`, [contestId, user_id, team_id, week_number]);
      }
      await client.query(`UPDATE contests SET current_participants =
        (SELECT COUNT(*) FROM survivor_participants WHERE contest_id = $1) WHERE contest_id = $1`, [contestId]);
      await client.query('COMMIT');
      return { participant_id: participant.id, pick };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  // Resolve unsaved lock times from the schedule and use the database clock everywhere.
  static async getWeekStatus(contestId, weekNumber, client = pool) {
    const result = await client.query(`
      SELECT sw.*, clock_timestamp() AS now,
        sw.end_date < (clock_timestamp() AT TIME ZONE 'America/New_York')::date AS has_ended,
        COALESCE(sw.lock_time, (
          SELECT MIN(COALESCE(g.start_time_utc, g.game_date::timestamp))
          FROM games g
          WHERE g.game_date BETWEEN sw.start_date AND sw.end_date AND g.game_type = 2
        )) AS lock_time
      FROM survivor_weeks sw
      JOIN contests c ON c.contest_id = sw.contest_id
      WHERE sw.contest_id = $1 AND sw.week_number = COALESCE($2, c.current_week)
    `, [contestId, weekNumber]);
    if (!result.rows.length) throw new Error('Week not found');
    const week = result.rows[0];
    return {
      ...week,
      is_locked: Boolean(week.is_locked || (week.lock_time && new Date(week.now) >= new Date(week.lock_time))),
    };
  }

  /**
   * Get all survivor contests
   */
  static async getAllContests() {
    const query = `
      SELECT 
        c.*,
        COUNT(DISTINCT sp.id) as total_participants,
        COUNT(DISTINCT CASE WHEN sp.is_eliminated = FALSE THEN sp.id END) as active_participants
      FROM contests c
      LEFT JOIN survivor_participants sp ON c.contest_id = sp.contest_id
      WHERE c.contest_type = 'survivor'
      GROUP BY c.contest_id
      ORDER BY c.created_at DESC
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  /**
   * Get contest by ID with full details
   */
  static async getContestById(contestId) {
    const contestQuery = `
      SELECT 
        c.*,
        COUNT(DISTINCT sp.id) as total_participants,
        COUNT(DISTINCT CASE WHEN sp.is_eliminated = FALSE THEN sp.id END) as active_participants
      FROM contests c
      LEFT JOIN survivor_participants sp ON c.contest_id = sp.contest_id
      WHERE c.contest_id = $1 AND c.contest_type = 'survivor'
      GROUP BY c.contest_id
    `;
    
    const result = await pool.query(contestQuery, [contestId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const contest = result.rows[0];
    
    // Get current week info
    const weekQuery = `
      SELECT * FROM survivor_weeks
      WHERE contest_id = $1 AND week_number = $2
    `;
    const weekResult = await pool.query(weekQuery, [contestId, contest.current_week]);
    contest.current_week_info = weekResult.rows[0] || null;
    
    return contest;
  }

  /**
   * Create a new survivor contest
   */
  static async createContest(contestData) {
    const { contest_name, season_year, season_start_date, season_end_date, max_participants } = contestData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create contest
      const contestQuery = `
        INSERT INTO contests (
          contest_name, 
          season_year, 
          contest_type, 
          max_participants,
          current_week,
          phase,
          status
        )
        VALUES ($1, $2, 'survivor', $3, 1, 'regular_season', 'waiting')
        RETURNING *
      `;
      
      const contestResult = await client.query(contestQuery, [
        contest_name,
        season_year,
        max_participants || 50
      ]);
      
      const contest = contestResult.rows[0];
      
      // Preserve season-specific templates, including their scheduled breaks.
      if (!/^\d{4}-\d{2}$/.test(season_year)) {
        throw new Error(`Invalid season_year format: "${season_year}". Expected "YYYY-YY" (e.g., "2024-25")`);
      }
      const startYear = parseInt(season_year.split('-')[0]);
      if (season_year !== `${startYear}-${String(startYear + 1).slice(-2)}`) throw new Error('Season must span consecutive years');
      
      // Template weeks for each season start in October of the start year
      // We filter by looking for weeks where the start_date is in the correct year range
      const templateStartDate = `${startYear}-10-01`;
      const templateEndDate = `${startYear + 1}-05-01`; // End of season (April)
      
      // Copy default weeks from the survivor_weeks table template (contest_id IS NULL)
      // Filter by date range to get the correct season's template
      const copyWeeksQuery = `
        INSERT INTO survivor_weeks (contest_id, week_number, start_date, end_date, is_locked)
        SELECT 
          $1 as contest_id,
          week_number,
          start_date,
          end_date,
          FALSE as is_locked
        FROM survivor_weeks
        WHERE contest_id IS NULL
          AND start_date >= $2::date
          AND start_date < $3::date
        ORDER BY week_number
      `;
      
      let result = season_end_date ? { rowCount: 0 } : await client.query(copyWeeksQuery, [
        contest.contest_id, 
        templateStartDate, 
        templateEndDate
      ]);
      
      // Explicit season dates avoid truncating longer seasons to a fixed week count.
      if (result.rowCount === 0) {
        const startDate = new Date(`${season_start_date}T00:00:00.000Z`);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(season_start_date) ||
          !Number.isFinite(startDate.getTime()) ||
          startDate.toISOString().slice(0, 10) !== season_start_date ||
          season_start_date < `${startYear}-07-01` ||
          season_start_date >= `${startYear + 1}-07-01`
        ) {
          throw new Error(`Enter a valid season start date for ${season_year}.`);
        }
        const endDate = new Date(`${season_end_date}T00:00:00.000Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(season_end_date) || !Number.isFinite(endDate.getTime()) ||
            endDate.toISOString().slice(0, 10) !== season_end_date || season_end_date < season_start_date ||
            season_end_date >= `${startYear + 1}-07-01`) {
          throw new Error(`Enter the regular-season end date for ${season_year}.`);
        }

        const startDates = [];
        const endDates = [];
        for (let week = 0; week * 7 * 86400000 <= endDate - startDate; week++) {
          const date = new Date(startDate);
          date.setUTCDate(date.getUTCDate() + week * 7);
          startDates.push(date.toISOString().slice(0, 10));
          date.setUTCDate(date.getUTCDate() + 6);
          endDates.push(date > endDate ? season_end_date : date.toISOString().slice(0, 10));
        }

        result = await client.query(`
          INSERT INTO survivor_weeks (contest_id, week_number, start_date, end_date, is_locked)
          SELECT $1, week_number, start_date, end_date, FALSE
          FROM unnest($2::date[], $3::date[]) WITH ORDINALITY
            AS weeks(start_date, end_date, week_number)
        `, [contest.contest_id, startDates, endDates]);
      }
      
      console.log(`✅ Created survivor contest with ${result.rowCount} weeks for season ${season_year}`);
      
      await client.query('COMMIT');
      
      return contest;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Join a survivor contest
   */
  static async joinContest(contestId, userId, participantName) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Lock contest row
      const contestQuery = 'SELECT * FROM contests WHERE contest_id = $1 FOR UPDATE';
      const contestResult = await client.query(contestQuery, [contestId]);
      
      if (contestResult.rows.length === 0) {
        throw new Error('Contest not found');
      }
      
      const contest = contestResult.rows[0];
      
      if (contest.contest_type !== 'survivor') {
        throw new Error('Not a survivor contest');
      }
      
      if (contest.status !== 'waiting' && contest.status !== 'active') {
        throw new Error('Contest is not accepting new participants');
      }
      
      // Check if already joined
      const existingQuery = `
        SELECT * FROM survivor_participants 
        WHERE contest_id = $1 AND user_id = $2
      `;
      const existingResult = await client.query(existingQuery, [contestId, userId]);
      
      if (existingResult.rows.length > 0) {
        throw new Error('You have already joined this contest');
      }
      
      // Check if contest is full
      const countQuery = `
        SELECT COUNT(*) as count 
        FROM survivor_participants 
        WHERE contest_id = $1
      `;
      const countResult = await client.query(countQuery, [contestId]);
      const currentCount = parseInt(countResult.rows[0].count);
      
      if (currentCount >= contest.max_participants) {
        throw new Error('Contest is full');
      }
      
      // Create participant
      const participantQuery = `
        INSERT INTO survivor_participants (
          contest_id, user_id, participant_name, is_eliminated, joined_at
        )
        VALUES ($1, $2, $3, FALSE, NOW())
        RETURNING *
      `;
      
      const participantResult = await client.query(participantQuery, [
        contestId,
        userId,
        participantName
      ]);
      
      const participant = participantResult.rows[0];
      
      // Update participant count
      const updateQuery = `
        UPDATE contests 
        SET current_participants = (
          SELECT COUNT(*) FROM survivor_participants WHERE contest_id = $1
        )
        WHERE contest_id = $1
        RETURNING *
      `;
      
      await client.query(updateQuery, [contestId]);
      
      // Create default notification preferences
      const prefsQuery = `
        INSERT INTO user_notification_preferences (
          user_id, contest_id, email_reminders, email_eliminations, 
          email_results, email_advancement
        )
        VALUES ($1, $2, TRUE, TRUE, TRUE, TRUE)
        ON CONFLICT (user_id, contest_id) DO NOTHING
      `;
      
      await client.query(prefsQuery, [userId, contestId]);
      
      await client.query('COMMIT');
      
      return participant;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Leave a survivor contest
   */
  static async leaveContest(contestId, userId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check contest status
      const contestQuery = 'SELECT * FROM contests WHERE contest_id = $1';
      const contestResult = await client.query(contestQuery, [contestId]);
      
      if (contestResult.rows.length === 0) {
        throw new Error('Contest not found');
      }
      
      const contest = contestResult.rows[0];
      
      if (contest.status !== 'waiting') {
        throw new Error('Cannot leave contest that has already started');
      }
      
      // Check if user is participant
      const participantQuery = `
        SELECT * FROM survivor_participants 
        WHERE contest_id = $1 AND user_id = $2
      `;
      const participantResult = await client.query(participantQuery, [contestId, userId]);
      
      if (participantResult.rows.length === 0) {
        throw new Error('You are not a participant in this contest');
      }
      
      // Delete participant and related data
      const deleteQuery = `
        DELETE FROM survivor_participants 
        WHERE contest_id = $1 AND user_id = $2
        RETURNING *
      `;
      
      const result = await client.query(deleteQuery, [contestId, userId]);
      
      // Update participant count
      const updateQuery = `
        UPDATE contests 
        SET current_participants = (
          SELECT COUNT(*) FROM survivor_participants WHERE contest_id = $1
        )
        WHERE contest_id = $1
      `;
      
      await client.query(updateQuery, [contestId]);
      
      await client.query('COMMIT');
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get user's status in a contest
   */
  static async getUserStatus(contestId, userId) {
    const query = `
      SELECT 
        sp.*,
        (SELECT COUNT(*) FROM survivor_team_usage 
         WHERE user_id = sp.user_id AND contest_id = sp.contest_id AND phase = 'regular_season') as teams_used,
        (SELECT COUNT(*) FROM survivor_picks 
         WHERE user_id = sp.user_id AND contest_id = sp.contest_id AND result = 'survived') as weeks_survived,
        c.current_week,
        c.phase
      FROM survivor_participants sp
      JOIN contests c ON sp.contest_id = c.contest_id
      WHERE sp.contest_id = $1 AND sp.user_id = $2
    `;
    
    const result = await pool.query(query, [contestId, userId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const status = result.rows[0];
    
    // Calculate teams remaining (32 NHL teams - teams used)
    status.teams_remaining = 32 - parseInt(status.teams_used);
    
    return status;
  }

  /**
   * Get all participants in a contest
   */
  static async getContestParticipants(contestId) {
    const query = `
      SELECT 
        sp.*,
        u.email,
        (SELECT COUNT(*) FROM survivor_team_usage 
         WHERE user_id = sp.user_id AND contest_id = sp.contest_id AND phase = 'regular_season') as teams_used,
        (SELECT COUNT(*) FROM survivor_picks 
         WHERE user_id = sp.user_id AND contest_id = sp.contest_id AND result = 'survived') as weeks_survived
      FROM survivor_participants sp
      LEFT JOIN users u ON sp.user_id = u.id
      WHERE sp.contest_id = $1
      ORDER BY 
        sp.is_eliminated ASC,
        weeks_survived DESC,
        sp.joined_at ASC
    `;
    
    const result = await pool.query(query, [contestId]);
    return result.rows;
  }

  /**
   * Get standings for a contest
   */
  static async getStandings(contestId) {
    const query = `
      SELECT 
        sp.id,
        sp.participant_name,
        sp.is_eliminated,
        sp.elimination_week,
        sp.placement,
        u.email,
        (SELECT COUNT(*) FROM survivor_picks 
         WHERE user_id = sp.user_id AND contest_id = sp.contest_id AND result = 'survived') as weeks_survived,
        (SELECT COUNT(*) FROM survivor_team_usage 
         WHERE user_id = sp.user_id AND contest_id = sp.contest_id AND phase = 'regular_season') as teams_used,
        (SELECT json_agg(nt.abbreviation ORDER BY stu.used_in_week)
         FROM survivor_team_usage stu
         JOIN nhl_teams nt ON stu.team_id = nt.team_id
         WHERE stu.user_id = sp.user_id AND stu.contest_id = sp.contest_id 
         AND stu.phase = 'regular_season') as teams_used_list
      FROM survivor_participants sp
      LEFT JOIN users u ON sp.user_id = u.id
      WHERE sp.contest_id = $1
      ORDER BY 
        sp.is_eliminated ASC,
        weeks_survived DESC,
        sp.joined_at ASC
    `;
    
    const result = await pool.query(query, [contestId]);
    
    const standings = {
      active_participants: result.rows.filter(p => !p.is_eliminated).length,
      eliminated_participants: result.rows.filter(p => p.is_eliminated).length,
      participants: result.rows
    };
    
    return standings;
  }

  /**
   * Get available teams for a user in a contest
   * @param {number} contestId
   * @param {number} userId
   * @param {number|null} weekNumber - specific week to query (defaults to current_week)
   */
  static async getAvailableTeams(contestId, userId, weekNumber = null) {
    // Get contest and verify user is participant
    const contestQuery = `
      SELECT c.*, sp.is_eliminated
      FROM contests c
      JOIN survivor_participants sp ON c.contest_id = sp.contest_id
      WHERE c.contest_id = $1 AND sp.user_id = $2
    `;
    const contestResult = await pool.query(contestQuery, [contestId, userId]);

    if (contestResult.rows.length === 0) {
      throw new Error('Contest not found or you are not a participant');
    }

    const contest = contestResult.rows[0];

    if (contest.is_eliminated) {
      throw new Error('You have been eliminated from this contest');
    }

    // Get week info (use specified week or current week)
    const targetWeek = weekNumber || contest.current_week;
    const currentWeek = await this.refreshWeekSchedule(contestId, targetWeek);

    // Get teams already used by this user
    const usedTeamsQuery = `
      SELECT team_id FROM survivor_team_usage
      WHERE contest_id = $1 AND user_id = $2 AND phase = 'regular_season'
        AND used_in_week <> $3
    `;
    const usedTeamsResult = await pool.query(usedTeamsQuery, [contestId, userId, targetWeek]);
    const usedTeamIds = usedTeamsResult.rows.map(row => row.team_id);

    // Get all NHL teams with their game count for current week
    const teamsQuery = `
      SELECT
        nt.team_id,
        nt.team_name,
        nt.abbreviation,
        d.division_name as division,
        d.conference_name as conference,
        COUNT(g.game_id) as games_this_week
      FROM nhl_teams nt
      LEFT JOIN divisions d ON nt.division_id = d.division_id
      LEFT JOIN games g ON nt.team_id = g.team_id
        AND g.game_date BETWEEN $1 AND $2
        AND g.game_type = 2
      GROUP BY nt.team_id, nt.team_name, nt.abbreviation, d.division_name, d.conference_name
      ORDER BY d.conference_name, d.division_name, nt.team_name
    `;

    const teamsResult = await pool.query(teamsQuery, [
      currentWeek.start_date,
      currentWeek.end_date
    ]);

    const teams = teamsResult.rows.map(team => ({
      team_id: team.team_id,
      team_name: team.team_name,
      abbreviation: team.abbreviation,
      division: team.division,
      conference: team.conference,
      games_this_week: parseInt(team.games_this_week),
      is_available: !usedTeamIds.includes(team.team_id)
    }));

    return {
      week_number: targetWeek,
      week_info: currentWeek,
      available_teams: teams.filter(t => t.is_available),
      used_teams: teams.filter(t => !t.is_available),
      all_teams: teams
    };
  }

  /**
   * Record an emailed pick through the admin-only route.
   */
  static async addAdminPick(contestId, { user_id, week_number, team_id, submitted_at }) {
    if (![user_id, week_number, team_id].every(value => Number.isInteger(value) && value > 0)) {
      throw new Error('Choose a participant, week, and team');
    }
    if (typeof submitted_at !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(submitted_at)
        || !Number.isFinite(Date.parse(submitted_at))) {
      throw new Error('Enter the original submission date/time with timezone');
    }
    return this.submitPick(contestId, user_id, week_number, team_id, { submittedAt: submitted_at });
  }

  // adminRecord is supplied only by the admin entry point; player requests cannot set it.
  static async submitPick(contestId, userId, weekNumber, teamId, adminRecord = null) {
    await this.refreshWeekSchedule(contestId, weekNumber);
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get contest and participant info
      const contestQuery = `
        SELECT c.*, sp.is_eliminated, sp.id as participant_id
        FROM contests c
        JOIN survivor_participants sp ON c.contest_id = sp.contest_id
        WHERE c.contest_id = $1 AND sp.user_id = $2
        FOR UPDATE OF c, sp
      `;
      const contestResult = await client.query(contestQuery, [contestId, userId]);
      
      if (contestResult.rows.length === 0) {
        throw new Error('Contest not found or you are not a participant');
      }
      
      const contest = contestResult.rows[0];

      if (adminRecord) {
        if (contest.contest_type !== 'survivor' || contest.status !== 'in_progress') throw new Error('Add Pick requires an in-progress Survivor contest');
        const user = await client.query('SELECT 1 FROM users WHERE id = $1 AND active = TRUE', [userId]);
        if (!user.rows.length) throw new Error('Choose an active participant account');
        const existing = await client.query('SELECT 1 FROM survivor_picks WHERE contest_id = $1 AND user_id = $2 AND week_number = $3', [contestId, userId, weekNumber]);
        if (existing.rows.length) throw new Error('A pick already exists for this participant and week. Use View/Override Picks to edit it');
      }
      
      if (contest.is_eliminated) {
        throw new Error('You have been eliminated from this contest');
      }
      
      if (!['waiting', 'in_progress'].includes(contest.status) || contest.phase !== 'regular_season') {
        throw new Error('Contest is not accepting regular season picks');
      }
      if (!Number.isInteger(weekNumber) || weekNumber < contest.current_week) {
        throw new Error('Cannot submit a pick for a past or invalid week');
      }
      
      // Verify team is valid
      const teamQuery = 'SELECT * FROM nhl_teams WHERE team_id = $1';
      const teamResult = await client.query(teamQuery, [teamId]);
      
      if (teamResult.rows.length === 0) {
        throw new Error('Invalid team');
      }
      
      const team = teamResult.rows[0];
      
      // Check if team already used (FOR UPDATE prevents concurrent duplicate picks)
      const usageQuery = `
        SELECT * FROM survivor_team_usage
        WHERE contest_id = $1 AND user_id = $2 AND team_id = $3 AND phase = 'regular_season'
        FOR UPDATE
      `;
      const usageResult = await client.query(usageQuery, [contestId, userId, teamId]);
      
      if (usageResult.rows.some(usage => usage.used_in_week !== weekNumber)) {
        throw new Error(`You have already used ${team.abbreviation} in this contest`);
      }
      
      // Get week info
      const week = await this.getWeekStatus(contestId, weekNumber, client);
      if (week.has_ended) throw new Error('Cannot submit a pick after the week has ended');
      const now = new Date(adminRecord ? adminRecord.submittedAt : week.now);
      if (adminRecord && now > new Date(week.now)) throw new Error('The original submission time cannot be in the future');
      const isLatePick = adminRecord && week.lock_time ? now >= new Date(week.lock_time) : week.is_locked;
      
      // Get team's games for this week
      const gamesQuery = `
        SELECT * FROM games
        WHERE team_id = $1 
          AND game_date BETWEEN $2 AND $3
          AND game_type = 2
        ORDER BY game_date ASC
      `;
      const gamesResult = await client.query(gamesQuery, [
        teamId,
        week.start_date,
        week.end_date
      ]);
      
      const allGames = gamesResult.rows;
      const totalGames = allGames.length;
      
      // Check if team has any games this week
      if (totalGames === 0) {
        throw new Error(
          `${team.abbreviation} has no games scheduled for Week ${weekNumber} ` +
          `(${new Date(week.start_date).toLocaleDateString()} - ${new Date(week.end_date).toLocaleDateString()}). ` +
          `Please select a different team.`
        );
      }
      
      // Calculate late pick penalty
      let gamesExcluded = 0;
      let remainingGames = totalGames;
      
      if (isLatePick) {
        // An unknown start time cannot safely earn a late picker a win.
        gamesExcluded = allGames.filter(g => {
          return !g.start_time_utc || new Date(g.start_time_utc) <= now;
        }).length;
        remainingGames = totalGames - gamesExcluded;
      }
      
      const gamesNeeded = totalGames >= 4 ? 2 : 1;
      
      // Check if mathematically possible to win
      if (remainingGames < gamesNeeded) {
        throw new Error(
          `Pick not possible: ${gamesExcluded} game(s) already started. ` +
          `Need ${gamesNeeded} win(s) but only ${remainingGames} game(s) remaining.`
        );
      }
      
      // Check if pick already exists
      const existingPickQuery = `
        SELECT * FROM survivor_picks
        WHERE contest_id = $1 AND user_id = $2 AND week_number = $3
      `;
      const existingPickResult = await client.query(existingPickQuery, [contestId, userId, weekNumber]);
      
      let pick;
      
      if (existingPickResult.rows.length > 0) {
        // Reject ALL modifications after lock time
        if (week.is_locked) {
          throw new Error('Cannot modify picks after lock time');
        }
        
        // Delete old team usage
        const deleteUsageQuery = `
          DELETE FROM survivor_team_usage
          WHERE contest_id = $1 AND user_id = $2 AND used_in_week = $3
            AND phase = 'regular_season'
        `;
        await client.query(deleteUsageQuery, [contestId, userId, weekNumber]);
        
        // Update pick
        const updatePickQuery = `
          UPDATE survivor_picks
          SET team_id = $1,
              is_late_pick = $2,
              games_excluded = $3,
              games_needed = $4,
              games_played = $5,
              submitted_at = clock_timestamp(),
              updated_at = NOW()
          WHERE contest_id = $6 AND user_id = $7 AND week_number = $8
          RETURNING *
        `;
        const updateResult = await client.query(updatePickQuery, [
          teamId,
          isLatePick,
          gamesExcluded,
          gamesNeeded,
          totalGames,
          contestId,
          userId,
          weekNumber
        ]);
        
        pick = updateResult.rows[0];
      } else {
        // Create new pick
        const insertPickQuery = `
          INSERT INTO survivor_picks (
            contest_id, participant_id, user_id, week_number, team_id,
            pick_type, games_needed, is_late_pick, games_excluded, games_played,
            result, submitted_at
          )
          VALUES ($1, $2, $3, $4, $5, 'regular_season', $6, $7, $8, $9, 'pending', COALESCE($10::timestamptz, clock_timestamp()))
          RETURNING *
        `;
        const insertResult = await client.query(insertPickQuery, [
          contestId,
          contest.participant_id,
          userId,
          weekNumber,
          teamId,
          gamesNeeded,
          isLatePick,
          gamesExcluded,
          totalGames,
          adminRecord?.submittedAt || null
        ]);
        
        pick = insertResult.rows[0];
      }
      
      // Record team usage
      const usageInsertQuery = `
        INSERT INTO survivor_team_usage (
          contest_id, user_id, team_id, used_in_week, phase
        )
        VALUES ($1, $2, $3, $4, 'regular_season')
        ON CONFLICT (contest_id, user_id, team_id, phase)
          DO UPDATE SET used_in_week = EXCLUDED.used_in_week
      `;
      await client.query(usageInsertQuery, [contestId, userId, teamId, weekNumber]);
      
      await client.query('COMMIT');
      
      return {
        pick,
        team,
        week,
        is_late_pick: isLatePick,
        games_excluded: gamesExcluded,
        remaining_games: remainingGames,
        games_needed: gamesNeeded,
        warning: isLatePick ? 
          `Late pick: ${gamesExcluded} game(s) already started won't count. ` +
          `You need ${gamesNeeded} win(s) from the remaining ${remainingGames} game(s).` : null
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all picks for a specific week (with visibility rules)
   */
  static async getWeekPicks(contestId, weekNumber, userId) {
    const client = await pool.connect();
    
    try {
      const week = await this.getWeekStatus(contestId, weekNumber, client);
      const isLocked = week.is_locked;
      
      // Check if user has submitted a pick
      const userPickQuery = `
        SELECT * FROM survivor_picks
        WHERE contest_id = $1 AND user_id = $2 AND week_number = $3
      `;
      const userPickResult = await client.query(userPickQuery, [contestId, userId, weekNumber]);
      const userHasPicked = userPickResult.rows.length > 0;
      
      // Picks are revealed only after lock, and only to players who have picked.
      const canSeePicks = isLocked && userHasPicked;
      
      if (!canSeePicks) {
        return {
          week_number: weekNumber,
          is_locked: isLocked,
          user_has_picked: userHasPicked,
          can_see_picks: false,
          picks: [],
          message: 'Picks are visible after lock time once you have submitted your pick'
        };
      }
      
      // Get all picks for this week
      const picksQuery = `
        SELECT 
          sp_pick.*,
          progress.games_played, progress.games_won, progress.games_needed, progress.games_excluded,
          progress.games_won AS wins, progress.losses,
          sp.participant_name,
          u.email,
          nt.team_name,
          nt.abbreviation
        FROM survivor_picks sp_pick
        JOIN survivor_pick_progress progress ON progress.id = sp_pick.id
        JOIN survivor_participants sp ON sp_pick.participant_id = sp.id
        LEFT JOIN users u ON sp_pick.user_id = u.id
        LEFT JOIN nhl_teams nt ON sp_pick.team_id = nt.team_id
        WHERE sp_pick.contest_id = $1 AND sp_pick.week_number = $2
        ORDER BY sp.participant_name
      `;
      const picksResult = await client.query(picksQuery, [contestId, weekNumber]);
      
      return {
        week_number: weekNumber,
        is_locked: isLocked,
        user_has_picked: userHasPicked,
        can_see_picks: true,
        week_info: week,
        picks: picksResult.rows
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get user's pick history
   */
  static async getMyPicks(contestId, userId) {
    const query = `
      SELECT 
        sp_pick.*,
        progress.games_played, progress.games_won, progress.games_needed, progress.games_excluded,
        progress.games_won AS wins, progress.losses,
        nt.team_name,
        nt.abbreviation,
        sw.start_date,
        sw.end_date,
        sw.lock_time,
        sw.is_locked
      FROM survivor_picks sp_pick
      JOIN survivor_pick_progress progress ON progress.id = sp_pick.id
      LEFT JOIN nhl_teams nt ON sp_pick.team_id = nt.team_id
      LEFT JOIN survivor_weeks sw ON sp_pick.contest_id = sw.contest_id 
        AND sp_pick.week_number = sw.week_number
      WHERE sp_pick.contest_id = $1 AND sp_pick.user_id = $2
      ORDER BY sp_pick.week_number ASC
    `;
    
    const result = await pool.query(query, [contestId, userId]);
    return result.rows;
  }

  /**
   * Cancel/Delete a pick (only before lock time)
   */
  static async cancelPick(contestId, userId, weekNumber) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Serialize cancellation with submissions and contest advancement.
      const contestResult = await client.query(`
        SELECT c.*, sp.is_eliminated FROM contests c
        JOIN survivor_participants sp ON sp.contest_id = c.contest_id
        WHERE c.contest_id = $1 AND sp.user_id = $2 FOR UPDATE OF c, sp
      `, [contestId, userId]);
      const contest = contestResult.rows[0];
      if (!contest || contest.is_eliminated || !['waiting', 'in_progress'].includes(contest.status) ||
          contest.phase !== 'regular_season' || weekNumber < contest.current_week) {
        throw new Error('Cannot cancel this pick');
      }
      const week = await this.getWeekStatus(contestId, weekNumber, client);
      if (week.is_locked || week.has_ended) {
        throw new Error('Cannot cancel pick after lock time');
      }
      
      // Check if pick exists
      const pickQuery = `
        SELECT * FROM survivor_picks
        WHERE contest_id = $1 AND user_id = $2 AND week_number = $3
      `;
      const pickResult = await client.query(pickQuery, [contestId, userId, weekNumber]);
      
      if (pickResult.rows.length === 0) {
        throw new Error('No pick found for this week');
      }
      
      const pick = pickResult.rows[0];
      
      // Delete team usage
      const deleteUsageQuery = `
        DELETE FROM survivor_team_usage
        WHERE contest_id = $1 AND user_id = $2 AND used_in_week = $3
          AND phase = 'regular_season'
      `;
      await client.query(deleteUsageQuery, [contestId, userId, weekNumber]);
      
      // Delete pick
      const deletePickQuery = `
        DELETE FROM survivor_picks
        WHERE contest_id = $1 AND user_id = $2 AND week_number = $3
        RETURNING *
      `;
      const deleteResult = await client.query(deletePickQuery, [contestId, userId, weekNumber]);
      
      await client.query('COMMIT');
      
      return deleteResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get lock status for current week
   */
  static async getLockStatus(contestId, weekNumber = null) {
    const data = await this.getWeekStatus(contestId, weekNumber);
    const now = new Date(data.now);
    const lockTime = data.lock_time ? new Date(data.lock_time) : null;
    const isLocked = data.is_locked;
    
    // Calculate time until lock
    let timeUntilLock = null;
    if (lockTime && !isLocked) {
      timeUntilLock = Math.floor((lockTime - now) / 1000); // seconds
    }
    
    // Get first game info (use start_time_utc if available)
    const firstGameQuery = `
      SELECT 
        g.game_id,
        g.game_date,
        g.start_time_utc,
        ht.abbreviation as home_team,
        at.abbreviation as away_team
      FROM games g
      JOIN nhl_teams ht ON g.team_id = ht.team_id
      JOIN nhl_teams at ON g.opponent_id = at.team_id
      WHERE g.game_date BETWEEN $1 AND $2
        AND g.game_type = 2
      ORDER BY COALESCE(g.start_time_utc, g.game_date::timestamp) ASC
      LIMIT 1
    `;
    
    let firstGame = null;
    if (data.start_date && data.end_date) {
      const gameResult = await pool.query(firstGameQuery, [data.start_date, data.end_date]);
      firstGame = gameResult.rows[0] || null;
    }
    
    return {
      week_number: data.week_number,
      is_locked: isLocked,
      has_ended: data.has_ended,
      lock_time: lockTime,
      time_until_lock: timeUntilLock,
      start_date: data.start_date,
      end_date: data.end_date,
      first_game: firstGame
    };
  }

  /**
   * Get weekly schedule (all games for all teams in a week)
   */
  static async getWeeklySchedule(contestId, weekNumber) {
    const week = await this.refreshWeekSchedule(contestId, weekNumber);

    // Get all teams with their games for this week
    const scheduleQuery = `
      SELECT
        nt.team_id,
        nt.team_name,
        nt.abbreviation,
        json_agg(
          json_build_object(
            'game_id', g.game_id,
            'game_date', g.game_date,
            'start_time_utc', g.start_time_utc,
            'opponent', ot.abbreviation,
            'opponent_name', ot.team_name,
            'is_home', g.is_home,
            'result', g.result,
            'team_score', g.team_score,
            'opponent_score', g.opponent_score,
            'game_state', g.game_state
          ) ORDER BY g.game_date
        ) FILTER (WHERE g.game_id IS NOT NULL) as games,
        COUNT(g.game_id) as total_games
      FROM nhl_teams nt
      LEFT JOIN games g ON nt.team_id = g.team_id
        AND g.game_date BETWEEN $1 AND $2
        AND g.game_type = 2
      LEFT JOIN nhl_teams ot ON g.opponent_id = ot.team_id
      GROUP BY nt.team_id, nt.team_name, nt.abbreviation
      ORDER BY nt.team_name
    `;

    const scheduleResult = await pool.query(scheduleQuery, [
      week.start_date,
      week.end_date
    ]);

    return {
      week_number: weekNumber,
      week_info: week,
      teams: scheduleResult.rows
    };
  }

  static async refreshWeekSchedule(contestId, weekNumber) {
    const week = await this.getWeekStatus(contestId, weekNumber);
    if (!week.has_ended) {
      await require('./NhlService').ensureScheduledGames(
        new Date(week.start_date).toISOString().slice(0, 10),
        new Date(week.end_date).toISOString().slice(0, 10));
    }
    return week;
  }

  /**
   * Start/Activate a survivor contest
   */
  static async startContest(contestId, startWeek = 1) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get contest
      const contestQuery = 'SELECT * FROM contests WHERE contest_id = $1 FOR UPDATE';
      const contestResult = await client.query(contestQuery, [contestId]);
      
      if (contestResult.rows.length === 0) {
        throw new Error('Contest not found');
      }
      
      const contest = contestResult.rows[0];
      
      if (contest.contest_type !== 'survivor') {
        throw new Error('Not a survivor contest');
      }
      
      if (contest.status === 'in_progress') {
        throw new Error('Contest is already active');
      }
      
      if (contest.status === 'completed' || contest.status === 'cancelled') {
        throw new Error('Cannot start a completed or cancelled contest');
      }
      
      // Check if there are any participants
      const participantsQuery = `
        SELECT COUNT(*) as count FROM survivor_participants
        WHERE contest_id = $1
      `;
      const participantsResult = await client.query(participantsQuery, [contestId]);
      const participantCount = parseInt(participantsResult.rows[0].count);
      
      if (participantCount === 0) {
        throw new Error('Cannot start contest with no participants');
      }
      
      if (!Number.isInteger(startWeek) || startWeek < 1) throw new Error('Choose a valid starting week');
      await this.getWeekStatus(contestId, startWeek, client);
      const incomplete = await client.query(`SELECT p.participant_name FROM survivor_participants p
        JOIN survivor_weeks w ON w.contest_id = p.contest_id AND w.week_number < $2
          AND (NOT p.is_eliminated OR p.elimination_week IS NULL OR w.week_number < p.elimination_week)
        LEFT JOIN survivor_picks sp ON sp.contest_id = p.contest_id AND sp.user_id = p.user_id AND sp.week_number = w.week_number
        WHERE p.contest_id = $1 AND sp.result IS DISTINCT FROM 'survived' LIMIT 1`, [contestId, startWeek]);
      if (incomplete.rows.length) throw new Error(`Import completed earlier-week results for ${incomplete.rows[0].participant_name} before starting at Week ${startWeek}`);

      // Update contest status to in_progress (active)
      const updateQuery = `
        UPDATE contests
        SET status = 'in_progress', current_week = $2,
            updated_at = NOW()
        WHERE contest_id = $1
        RETURNING *
      `;
      
      const updateResult = await client.query(updateQuery, [contestId, startWeek]);

      await client.query('UPDATE survivor_weeks SET is_locked = TRUE WHERE contest_id = $1 AND week_number < $2', [contestId, startWeek]);
      
      await client.query('COMMIT');
      
      const updatedContest = updateResult.rows[0];
      
      // Set up the selected starting week after activation.
      console.log(`\n🎯 Contest started! Now setting up Week ${startWeek} schedule...`);
      try {
        const setupResult = await this.setupWeekSchedule(contestId, startWeek);
        console.log(`✅ Week ${startWeek} setup completed:`, setupResult);
        
        return {
          ...updatedContest,
          week_setup: setupResult
        };
      } catch (setupError) {
        console.error(`⚠️  Warning: Failed to setup Week ${startWeek} automatically:`, setupError.message);
        console.error(`   You may need to manually setup Week ${startWeek} using the setup endpoint.`);
        
        // Don't fail the contest start if week setup fails
        return {
          ...updatedContest,
          week_setup: {
            success: false,
            error: setupError.message,
            message: `Contest started but Week ${startWeek} setup failed. Please setup manually.`
          }
        };
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all weeks for a contest
   */
  static async getWeeks(contestId) {
    const query = `
      SELECT * FROM survivor_weeks
      WHERE contest_id = $1
      ORDER BY week_number
    `;
    
    const result = await pool.query(query, [contestId]);
    return result.rows;
  }

  /**
   * Update weeks for a contest
   */
  static async updateWeeks(contestId, weeks) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verify contest exists
      const contestQuery = 'SELECT * FROM contests WHERE contest_id = $1';
      const contestResult = await client.query(contestQuery, [contestId]);
      
      if (contestResult.rows.length === 0) {
        throw new Error('Contest not found');
      }
      
      const updatedWeeks = [];
      
      // Update each week
      for (const week of weeks) {
        // Don't update locked weeks
        if (week.is_locked) {
          updatedWeeks.push(week);
          continue;
        }
        
        const updateQuery = `
          UPDATE survivor_weeks
          SET 
            start_date = $1,
            end_date = $2
          WHERE id = $3 AND contest_id = $4
          RETURNING *
        `;
        
        const result = await client.query(updateQuery, [
          week.start_date,
          week.end_date,
          week.id,
          contestId
        ]);
        
        if (result.rows.length > 0) {
          updatedWeeks.push(result.rows[0]);
        }
      }
      
      await client.query('COMMIT');
      return updatedWeeks;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Setup week schedule - Fetch games from NHL API and update lock time
   * This combines fetching schedule and setting lock time in one operation
   */
  static async setupWeekSchedule(contestId, weekNumber) {
    const nhlService = require('./NhlService');
    
    try {
      console.log(`🏒 Setting up Week ${weekNumber} for Contest ${contestId}...`);
      
      // Step 1: Get week dates from database
      const weekQuery = `
        SELECT start_date, end_date 
        FROM survivor_weeks 
        WHERE contest_id = $1 AND week_number = $2
      `;
      const weekResult = await pool.query(weekQuery, [contestId, weekNumber]);
      
      if (weekResult.rows.length === 0) {
        throw new Error(`Week ${weekNumber} not found for contest ${contestId}`);
      }
      
      const { start_date, end_date } = weekResult.rows[0];
      
      // Format dates as YYYY-MM-DD strings
      const startDateStr = new Date(start_date).toISOString().split('T')[0];
      const endDateStr = new Date(end_date).toISOString().split('T')[0];
      
      console.log(`   Week ${weekNumber}: ${startDateStr} to ${endDateStr}`);
      
      // Step 2: Fetch schedule from NHL API directly
      console.log('   🔍 Fetching games schedule...');
      const scheduleResult = await nhlService.fetchAndStoreScheduledGames(startDateStr, endDateStr);
      
      console.log(`   ✅ Games stored: ${scheduleResult.games_stored}`);
      console.log(`   ⏭️  Games skipped: ${scheduleResult.games_skipped}`);
      
      if (scheduleResult.games_stored === 0) {
        console.log('   ⚠️  Warning: No games were stored. Lock time cannot be updated.');
        return {
          success: true,
          week_number: weekNumber,
          games_stored: 0,
          lock_time: null,
          message: 'No games found for this week'
        };
      }
      
      // Step 3: Update lock time based on first game
      console.log('   🔒 Updating lock time...');
      const lockResult = await this.updateWeekLockTime(contestId, weekNumber);
      
      if (lockResult.lock_time) {
        console.log(`   ✅ Lock time set to: ${new Date(lockResult.lock_time).toLocaleString()}`);
      } else {
        console.log(`   ⚠️  ${lockResult.message}`);
      }
      
      return {
        success: true,
        week_number: weekNumber,
        start_date: startDateStr,
        end_date: endDateStr,
        games_stored: scheduleResult.games_stored,
        lock_time: lockResult.lock_time,
        lock_time_formatted: lockResult.lock_time ? new Date(lockResult.lock_time).toLocaleString() : null
      };
    } catch (error) {
      console.error(`❌ Error setting up week ${weekNumber}:`, error.message);
      throw new Error(`Failed to setup week ${weekNumber}: ${error.message}`);
    }
  }

  /**
   * Update lock time for a specific week based on the first game
   * Fetches games for the week and sets lock_time to the earliest game start time
   */
  static async updateWeekLockTime(contestId, weekNumber) {
    const client = await pool.connect();
    
    try {
      // Get week info
      const weekQuery = `
        SELECT * FROM survivor_weeks
        WHERE contest_id = $1 AND week_number = $2
      `;
      const weekResult = await client.query(weekQuery, [contestId, weekNumber]);
      
      if (weekResult.rows.length === 0) {
        throw new Error(`Week ${weekNumber} not found for contest ${contestId}`);
      }
      
      const week = weekResult.rows[0];
      
      // Find the first game of the week
      const firstGameQuery = `
        SELECT 
          MIN(COALESCE(start_time_utc, game_date::timestamp)) as earliest_game_time
        FROM games
        WHERE game_date BETWEEN $1 AND $2
          AND game_type = 2
      `;
      
      const gameResult = await client.query(firstGameQuery, [week.start_date, week.end_date]);
      
      if (!gameResult.rows[0] || !gameResult.rows[0].earliest_game_time) {
        return {
          week_number: weekNumber,
          lock_time: null,
          message: `No games found for week ${weekNumber}. Lock time not updated.`
        };
      }
      
      const lockTime = gameResult.rows[0].earliest_game_time;
      
      // Update the week's lock_time
      const updateQuery = `
        UPDATE survivor_weeks
        SET lock_time = $1
        WHERE contest_id = $2 AND week_number = $3
        RETURNING *
      `;
      
      const updateResult = await client.query(updateQuery, [lockTime, contestId, weekNumber]);
      
      // Schedule notifications for this week (run in background)
      notificationService.scheduleWeekNotifications(contestId, weekNumber, lockTime).catch(err => {
        console.error(`⚠️  Warning: Failed to schedule notifications for week ${weekNumber}:`, err.message);
      });
      
      return {
        week_number: weekNumber,
        lock_time: lockTime,
        start_date: week.start_date,
        end_date: week.end_date,
        message: `Lock time updated successfully for week ${weekNumber}`
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update lock times for all weeks in a contest
   * Useful after fetching schedules for multiple weeks
   */
  static async updateAllWeekLockTimes(contestId) {
    const client = await pool.connect();
    
    try {
      // Get all weeks for the contest
      const weeksQuery = `
        SELECT week_number FROM survivor_weeks
        WHERE contest_id = $1
        ORDER BY week_number
      `;
      const weeksResult = await client.query(weeksQuery, [contestId]);
      
      const results = [];
      
      for (const week of weeksResult.rows) {
        try {
          const result = await this.updateWeekLockTime(contestId, week.week_number);
          results.push(result);
        } catch (error) {
          results.push({
            week_number: week.week_number,
            error: error.message
          });
        }
      }
      
      const successCount = results.filter(r => r.lock_time).length;
      const failCount = results.filter(r => !r.lock_time).length;
      
      return {
        total_weeks: weeksResult.rows.length,
        updated: successCount,
        failed: failCount,
        results
      };
    } finally {
      client.release();
    }
  }

  /**
   * Process week results and determine survivors/eliminations
   * Based on Survivor Contest Rules:
   * - 3 games or fewer: Need at least 1 win to survive
   * - 4 games or more: Need at least 2 wins to survive
   * - Mass elimination protection: If everyone fails, everyone survives
   */
  static async processWeekResults(contestId, weekNumber, transactionClient = null) {
    const client = transactionClient || await pool.connect();
    const ownsTransaction = !transactionClient;
    
    try {
      if (ownsTransaction) await client.query('BEGIN');

      const contestResult = await client.query(`
        SELECT * FROM contests WHERE contest_id = $1 FOR UPDATE
      `, [contestId]);
      const contest = contestResult.rows[0];
      if (!contest || contest.contest_type !== 'survivor' || contest.status !== 'in_progress' ||
          contest.phase !== 'regular_season' || contest.current_week !== weekNumber) {
        throw new Error('Only the current regular-season week of an active contest can be processed');
      }
      const weekStatus = await this.getWeekStatus(contestId, weekNumber, client);
      if (!weekStatus.has_ended) throw new Error('Cannot finalize results before the week ends');
      const readiness = await this.checkWeekReadiness(contestId, weekNumber, client);
      if (!readiness.is_ready) throw new Error('Cannot finalize results until all scheduled games are finished');
      
      console.log(`\n⚡ Processing Week ${weekNumber} results...`);
      
      // Get week info
      const weekQuery = `
        SELECT * FROM survivor_weeks
        WHERE contest_id = $1 AND week_number = $2
      `;
      const weekResult = await client.query(weekQuery, [contestId, weekNumber]);
      
      if (weekResult.rows.length === 0) {
        throw new Error(`Week ${weekNumber} not found for contest ${contestId}`);
      }
      
      const week = weekResult.rows[0];
      
      // Get all active participants (to detect no-picks)
      const activeParticipantsQuery = `
        SELECT sp.id as participant_id, sp.user_id, sp.participant_name
        FROM survivor_participants sp
        WHERE sp.contest_id = $1 AND sp.is_eliminated = FALSE
      `;
      const activeParticipantsResult = await client.query(activeParticipantsQuery, [contestId]);
      const activeParticipants = activeParticipantsResult.rows;

      // Get all picks for this week from active participants
      const picksQuery = `
        SELECT 
          sp_pick.*,
          sp.participant_name,
          sp.is_eliminated,
          nt.abbreviation as team_abbr
        FROM survivor_picks sp_pick
        JOIN survivor_participants sp ON sp_pick.participant_id = sp.id
        LEFT JOIN nhl_teams nt ON sp_pick.team_id = nt.team_id
        WHERE sp_pick.contest_id = $1 
          AND sp_pick.week_number = $2
          AND sp.is_eliminated = FALSE
        ORDER BY sp.participant_name
      `;
      
      const picksResult = await client.query(picksQuery, [contestId, weekNumber]);
      const picks = picksResult.rows;
      
      // Identify active participants who did NOT submit a pick
      const pickUserIds = new Set(picks.map(p => p.user_id));
      const noPickParticipants = activeParticipants.filter(p => !pickUserIds.has(p.user_id));
      
      console.log(`   Found ${picks.length} picks to process, ${noPickParticipants.length} participant(s) with no pick`);
      
      const results = [];
      
      // Batch-fetch all games for all picked teams in one query (avoids N+1)
      const teamIds = [...new Set(picks.map(p => p.team_id))];
      const batchGamesQuery = `
        SELECT 
          game_id,
          team_id,
          game_date,
          start_time_utc,
          team_score,
          opponent_score,
          result,
          game_state
        FROM games
        WHERE team_id = ANY($1::int[])
          AND game_date BETWEEN $2 AND $3
          AND game_type = 2
        ORDER BY COALESCE(start_time_utc, game_date::timestamp) ASC
      `;
      const batchGamesResult = await client.query(batchGamesQuery, [teamIds, week.start_date, week.end_date]);
      
      // Partition games by team_id
      const gamesByTeam = {};
      for (const row of batchGamesResult.rows) {
        if (!gamesByTeam[row.team_id]) gamesByTeam[row.team_id] = [];
        gamesByTeam[row.team_id].push(row);
      }
      
      // Process each pick
      for (const pick of picks) {
        const allGames = gamesByTeam[pick.team_id] || [];
        const totalGames = allGames.length;
        
        // For late picks, exclude games that started before submission
        let eligibleGames = allGames;
        if (pick.is_late_pick && pick.submitted_at) {
          const submittedAt = new Date(pick.submitted_at);
          eligibleGames = allGames.filter(g => {
            return g.start_time_utc && new Date(g.start_time_utc) > submittedAt;
          });
        }
        
        // Count completed games and wins
        // Note: game_state 'OFF' means finished/final, 'FUT' means future/scheduled
        const completedGames = eligibleGames.filter(g => ['OFF', 'FINAL'].includes(g.game_state));
        const gamesWon = pick.games_won_override ?? completedGames.filter(g => g.result === 'W').length;
        const gamesCompleted = completedGames.length;
        const gamesExcluded = totalGames - eligibleGames.length;
        
        // Determine games needed based on total games played
        // Rule: 3 or fewer = need 1 win, 4 or more = need 2 wins
        const gamesNeeded = pick.games_needed_override ?? (totalGames >= 4 ? 2 : 1);
        
        // Check if all games are finished
        const allGamesComplete = totalGames > 0 &&
                                 eligibleGames.every(g => ['OFF', 'FINAL'].includes(g.game_state));
        
        // Determine result
        let pickResult = 'pending';
        if (allGamesComplete) {
          pickResult = pick.result_override ?? (gamesWon >= gamesNeeded ? 'survived' : 'eliminated');
        }
        
        // Update pick record
        const updatePickQuery = `
          UPDATE survivor_picks
          SET games_played = $1,
              games_won = $2,
              games_needed = $3,
              games_excluded = $4,
              result = $5,
              updated_at = NOW()
          WHERE id = $6
          RETURNING *
        `;
        
        await client.query(updatePickQuery, [
          totalGames,
          gamesWon,
          gamesNeeded,
          gamesExcluded,
          pickResult,
          pick.id
        ]);
        
        results.push({
          participant_id: pick.participant_id,
          participant_name: pick.participant_name,
          team_abbr: pick.team_abbr,
          total_games: totalGames,
          eligible_games: eligibleGames.length,
          games_completed: gamesCompleted,
          games_won: gamesWon,
          games_needed: gamesNeeded,
          result: pickResult,
          all_complete: allGamesComplete
        });
        
        console.log(`   ${pick.participant_name} (${pick.team_abbr}): ${gamesWon}/${gamesNeeded} wins needed - ${pickResult}`);
      }
      
      // Check if all picks are complete
      const allComplete = results.every(r => r.all_complete);
      if (!allComplete) throw new Error('Missing completed game data for one or more picks');
      
      // Separate picks by their current status
      let survivedPicks = results.filter(r => r.result === 'survived');
      let eliminatedPicks = results.filter(r => r.result === 'eliminated');
      const pendingPicks = results.filter(r => r.result === 'pending');
      
      let massEliminationPrevented = false;
      const playersToEliminate = [];
      
      // NO-PICK PARTICIPANTS: Always eliminated, never protected by mass elimination.
      // Push them into playersToEliminate immediately so every code path eliminates them.
      for (const noPick of noPickParticipants) {
        playersToEliminate.push(noPick.participant_id);
        results.push({
          participant_id: noPick.participant_id,
          participant_name: noPick.participant_name,
          team_abbr: 'NO PICK',
          total_games: 0,
          eligible_games: 0,
          games_completed: 0,
          games_won: 0,
          games_needed: 0,
          result: 'eliminated',
          all_complete: true,
          no_pick: true
        });
        console.log(`   ${noPick.participant_name}: NO PICK - eliminated (not protected by mass elimination)`);
      }
      
      // All games complete - process final results
      console.log(`\n   ✅ All games complete. Processing final results...`);

      // MASS ELIMINATION PROTECTION (Final)
      // Only considers participants who actually submitted picks.
      // If everyone who picked failed, they all survive. No-picks still get eliminated.
      if (eliminatedPicks.length > 0 && survivedPicks.length === 0) {
        console.log(`\n   🛡️  MASS ELIMINATION PROTECTION ACTIVATED!`);
        console.log(`   All ${eliminatedPicks.length} participants failed - everyone survives!`);

        massEliminationPrevented = true;

        // Update all picks to 'survived'
        const massProtectionQuery = `
          UPDATE survivor_picks
          SET result = 'survived',
              updated_at = NOW()
          WHERE contest_id = $1
            AND week_number = $2
            AND result = 'eliminated'
        `;
        await client.query(massProtectionQuery, [contestId, weekNumber]);

        // Move all to survived
        eliminatedPicks.forEach(p => {
          p.result = 'survived';
          survivedPicks.push(p);
        });
        eliminatedPicks.length = 0;
      } else if (eliminatedPicks.length > 0) {
        // Normal case - some survived, some failed
        playersToEliminate.push(...eliminatedPicks.map(p => p.participant_id));
      }

      // Eliminate participants who are confirmed eliminated
      if (playersToEliminate.length > 0) {
        console.log(`\n   ❌ Eliminating ${playersToEliminate.length} participant(s):`);
        
        for (const participantId of playersToEliminate) {
          const participant = results.find(r => r.participant_id === participantId);
          const eliminateQuery = `
            UPDATE survivor_participants
            SET is_eliminated = TRUE,
                elimination_week = $1
            WHERE id = $2
            RETURNING *
          `;
          
          await client.query(eliminateQuery, [weekNumber, participantId]);
          if (participant) {
            console.log(`      ${participant.participant_name} - eliminated`);
          }
        }
      }
      
      // Check for winner (only 1 person left)
      const remainingQuery = `
        SELECT COUNT(*) as count
        FROM survivor_participants
        WHERE contest_id = $1 AND is_eliminated = FALSE
      `;
      const remainingResult = await client.query(remainingQuery, [contestId]);
      const remainingCount = parseInt(remainingResult.rows[0].count);
      
      console.log(`\n   👥 Participants remaining: ${remainingCount}`);
      
      // If only 1 person left, mark them as winner and complete contest
      if (remainingCount === 1) {
        console.log(`\n   🏆 WINNER DETERMINED!`);
        
        const winnerQuery = `
          UPDATE survivor_participants
          SET placement = 1
          WHERE contest_id = $1 AND is_eliminated = FALSE
          RETURNING *
        `;
        const winnerResult = await client.query(winnerQuery, [contestId]);
        const winner = winnerResult.rows[0];
        
        console.log(`      Winner: ${winner.participant_name}`);
        
        // Mark contest as completed
        await client.query(`
          UPDATE contests
          SET status = 'completed',
              updated_at = NOW()
          WHERE contest_id = $1
        `, [contestId]);
      }
      
      if (remainingCount === 0) {
        await client.query("UPDATE contests SET status = 'completed', updated_at = NOW() WHERE contest_id = $1", [contestId]);
      }
      if (ownsTransaction) await client.query('COMMIT');
      
      return {
        week_number: weekNumber,
        picks_processed: results.length,
        survived: survivedPicks.length,
        eliminated: playersToEliminate.length,
        no_pick: noPickParticipants.length,
        pending: pendingPicks.length,
        remaining_participants: remainingCount,
        mass_elimination_prevented: massEliminationPrevented,
        all_complete: allComplete,
        winner_determined: remainingCount === 1,
        results: results
      };
      
    } catch (error) {
      if (ownsTransaction) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (ownsTransaction) client.release();
    }
  }

  /**
   * Check if week is ready for result processing
   * Week is ready if all games are in FINAL state
   */
  static async checkWeekReadiness(contestId, weekNumber, transactionClient = null) {
    const client = transactionClient || await pool.connect();
    
    try {
      // Get week dates
      const weekQuery = `
        SELECT start_date, end_date
        FROM survivor_weeks
        WHERE contest_id = $1 AND week_number = $2
      `;
      const weekResult = await client.query(weekQuery, [contestId, weekNumber]);
      
      if (weekResult.rows.length === 0) {
        return false;
      }
      
      const week = weekResult.rows[0];
      
      // Check if all games in this week are finished
      // Game states: OFF = finished/final, FUT = future/scheduled, LIVE = in progress
      // Note: games table has 2 records per game (one for each team), so we divide counts by 2
      const gamesQuery = `
        SELECT 
          COUNT(DISTINCT game_id) as total_games,
          COUNT(DISTINCT game_id) FILTER (WHERE game_state IN ('OFF', 'FINAL')) as finished_games,
          COUNT(DISTINCT game_id) FILTER (WHERE game_state = 'FUT') as future_games,
          COUNT(DISTINCT game_id) FILTER (WHERE game_state = 'LIVE') as live_games
        FROM games
        WHERE game_date BETWEEN $1 AND $2
          AND game_type = 2
      `;
      
      const gamesResult = await client.query(gamesQuery, [week.start_date, week.end_date]);
      const stats = gamesResult.rows[0];
      
      const totalGames = parseInt(stats.total_games) || 0;
      const finishedGames = parseInt(stats.finished_games) || 0;
      const futureGames = parseInt(stats.future_games) || 0;
      const liveGames = parseInt(stats.live_games) || 0;
      const pendingGames = totalGames - finishedGames;
      
      // Week is ready if there are games and all are finished (no FUT or LIVE games remaining)
      const isReady = totalGames > 0 && finishedGames === totalGames;
      
      return {
        is_ready: isReady,
        total_games: totalGames,
        finished_games: finishedGames,
        pending_games: pendingGames,
        future_games: futureGames,
        live_games: liveGames
      };
      
    } finally {
      if (!transactionClient) client.release();
    }
  }

  /**
   * Advance contest to next week
   * This includes processing current week results before advancing
   */
  static async advanceWeek(contestId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current contest state
      const contestQuery = `
        SELECT 
          c.*,
          sw.start_date as current_start,
          sw.end_date as current_end,
          sw.lock_time as current_lock_time
        FROM contests c
        LEFT JOIN survivor_weeks sw ON c.contest_id = sw.contest_id 
          AND c.current_week = sw.week_number
        WHERE c.contest_id = $1 AND c.contest_type = 'survivor'
        FOR UPDATE OF c
      `;
      
      const contestResult = await client.query(contestQuery, [contestId]);
      
      if (contestResult.rows.length === 0) {
        throw new Error('Survivor contest not found');
      }
      
      const contest = contestResult.rows[0];
      
      // Validate
      if (contest.status === 'completed') {
        throw new Error('Contest is already completed');
      }
      
      if (contest.status === 'waiting') {
        throw new Error('Contest has not started yet');
      }
      
      // Finalization and advancement must commit together under the same contest lock.
      const processResult = await this.processWeekResults(contestId, contest.current_week, client);
      if (!processResult.all_complete) throw new Error('Week results are not complete');
        
      // If winner was determined, contest is already completed.
      if (processResult.winner_determined || processResult.remaining_participants === 0) {
        await client.query('COMMIT');
        return {
          action: processResult.winner_determined ? 'completed_with_winner' : 'completed_no_survivors',
          week_number: contest.current_week,
          process_result: processResult
        };
      }
      
      // STEP 2: Advance to next week
      const nextWeek = contest.current_week + 1;
      
      // Check if next week exists
      const nextWeekQuery = `
        SELECT * FROM survivor_weeks
        WHERE contest_id = $1 AND week_number = $2
      `;
      const nextWeekResult = await client.query(nextWeekQuery, [contestId, nextWeek]);
      
      if (nextWeekResult.rows.length === 0) {
        // No more regular season weeks
        // Check how many survivors remain
        const survivorsQuery = `
          SELECT COUNT(*) as count
          FROM survivor_participants
          WHERE contest_id = $1 AND is_eliminated = FALSE
        `;
        const survivorsResult = await client.query(survivorsQuery, [contestId]);
        const survivorCount = parseInt(survivorsResult.rows[0].count);
        
        console.log(`\n🏁 Regular season complete! ${survivorCount} survivor(s) remaining.`);
        
        if (survivorCount === 0) {
          // No survivors - this shouldn't happen but handle it
          await client.query(`
            UPDATE contests
            SET status = 'completed', updated_at = NOW()
            WHERE contest_id = $1
          `, [contestId]);
          
          await client.query('COMMIT');
          
          return {
            action: 'completed_no_survivors',
            current_week: contest.current_week,
            survivors_remaining: 0,
            process_result: processResult,
            message: 'Contest completed - no survivors remaining'
          };
        } else if (survivorCount === 1) {
          // Single winner - mark them and complete
          await client.query(`
            UPDATE survivor_participants
            SET placement = 1
            WHERE contest_id = $1 AND is_eliminated = FALSE
          `, [contestId]);
          
          await client.query(`
            UPDATE contests
            SET status = 'completed', updated_at = NOW()
            WHERE contest_id = $1
          `, [contestId]);
          
          await client.query('COMMIT');
          
          return {
            action: 'completed_single_winner',
            current_week: contest.current_week,
            survivors_remaining: 1,
            process_result: processResult,
            message: 'Contest completed with single winner'
          };
        } else {
          // Multiple survivors - transition to playoff tiebreaker
          console.log(`\n🏒 ${survivorCount} survivors tied! Transitioning to playoff tiebreaker phase...`);
          
          await client.query(`
            UPDATE contests
            SET phase = 'playoff_tiebreaker',
                status = 'in_progress',
                playoff_round = 1,
                playoff_game_number = 1,
                updated_at = NOW()
            WHERE contest_id = $1
          `, [contestId]);
          
          // Initialize tiebreaker tables (participants + status)
          const tiebreakerInit = await this.initializeTiebreaker(contestId, client);
          
          await client.query('COMMIT');
          
          console.log(`✅ Playoff tiebreaker initialized: Round 1, Game 1`);
          console.log(`   ${survivorCount} survivors will pick teams for playoff Game 1`);
          
          return {
            action: 'transition_to_playoff_tiebreaker',
            current_week: contest.current_week,
            survivors_remaining: survivorCount,
            playoff_round: 1,
            playoff_game_number: 1,
            process_result: processResult,
            message: `Regular season complete. ${survivorCount} survivors tied - playoff tiebreaker phase started`,
            next_step: 'Survivors will now pick playoff teams for Round 1, Game 1'
          };
        }
      }
      
      // Advance the week
      await client.query(`
        UPDATE contests
        SET current_week = $1, updated_at = NOW()
        WHERE contest_id = $2
      `, [nextWeek, contestId]);
      
      await client.query('COMMIT');
      
      const advanceResult = {
        action: 'advanced',
        previous_week: contest.current_week,
        current_week: nextWeek,
        process_result: processResult
      };
      
      // After committing the week advance, setup the new week's schedule automatically
      console.log(`\n🎯 Advanced to Week ${nextWeek}! Now setting up Week ${nextWeek} schedule...`);
      try {
        const setupResult = await this.setupWeekSchedule(contestId, nextWeek);
        console.log(`✅ Week ${nextWeek} setup completed:`, setupResult);
        
        return {
          ...advanceResult,
          week_setup: setupResult
        };
      } catch (setupError) {
        console.error(`⚠️  Warning: Failed to setup Week ${nextWeek} automatically:`, setupError.message);
        console.error(`   You may need to manually setup Week ${nextWeek} using the setup endpoint.`);
        
        // Don't fail the week advance if setup fails
        return {
          ...advanceResult,
          week_setup: {
            success: false,
            error: setupError.message,
            message: `Week advanced but Week ${nextWeek} setup failed. Please setup manually.`
          }
        };
      }
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check and auto-advance weeks for all active contests
   * This should be called periodically by a cron job
   * It checks if current week has ended and advances if needed
   */
  static async checkAndAutoAdvanceWeeks() {
    try {
      console.log('\n🔍 Checking for weeks that need auto-advancement...');
      
      // Get all active survivor contests with their current week info
      const query = `
        SELECT 
          c.contest_id,
          c.contest_name,
          c.current_week,
          sw.week_number,
          sw.end_date,
          sw.lock_time
        FROM contests c
        JOIN survivor_weeks sw ON c.contest_id = sw.contest_id 
          AND c.current_week = sw.week_number
        WHERE c.contest_type = 'survivor'
          AND c.status = 'in_progress'
          AND c.phase = 'regular_season'
        ORDER BY c.contest_id
      `;
      
      const result = await pool.query(query);
      
      if (result.rows.length === 0) {
        console.log('   ℹ️  No active survivor contests found.');
        return {
          success: true,
          contests_checked: 0,
          contests_advanced: 0,
          message: 'No active contests to check'
        };
      }
      
      console.log(`   📋 Found ${result.rows.length} active contest(s) to check`);
      
      const now = new Date();
      const results = [];
      let advancedCount = 0;
      
      for (const contest of result.rows) {
        const endDate = new Date(contest.end_date);
        // Set end time to end of day (23:59:59)
        endDate.setHours(23, 59, 59, 999);
        
        console.log(`\n   🏒 Contest ${contest.contest_id} (${contest.contest_name})`);
        console.log(`      Current Week: ${contest.current_week}`);
        console.log(`      Week End: ${endDate.toLocaleString()}`);
        console.log(`      Now: ${now.toLocaleString()}`);
        
        // Check if week has ended
        if (now > endDate) {
          console.log(`      ✅ Week ${contest.current_week} has ended. Attempting to advance...`);
          
          try {
            const advanceResult = await this.advanceWeek(contest.contest_id);
            console.log(`      🎉 Successfully advanced to Week ${advanceResult.current_week}`);
            
            results.push({
              contest_id: contest.contest_id,
              contest_name: contest.contest_name,
              success: true,
              action: advanceResult.action,
              previous_week: advanceResult.previous_week,
              current_week: advanceResult.current_week
            });
            
            advancedCount++;
          } catch (error) {
            console.error(`      ❌ Failed to advance: ${error.message}`);
            
            // Check if error is because week was already advanced
            if (error.message.includes('Contest is already completed') || 
                error.message.includes('not found')) {
              console.log(`      ℹ️  Contest state changed, skipping...`);
            }
            
            results.push({
              contest_id: contest.contest_id,
              contest_name: contest.contest_name,
              success: false,
              error: error.message
            });
          }
        } else {
          const timeRemaining = endDate - now;
          const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
          const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
          
          console.log(`      ⏳ Week ${contest.current_week} still active (${hoursRemaining}h ${minutesRemaining}m remaining)`);
          
          results.push({
            contest_id: contest.contest_id,
            contest_name: contest.contest_name,
            success: true,
            action: 'no_action_needed',
            message: `Week ${contest.current_week} still in progress`
          });
        }
      }
      
      console.log(`\n✨ Auto-advance check completed:`);
      console.log(`   Total contests checked: ${result.rows.length}`);
      console.log(`   Contests advanced: ${advancedCount}`);
      
      return {
        success: true,
        contests_checked: result.rows.length,
        contests_advanced: advancedCount,
        timestamp: now.toISOString(),
        results
      };
      
    } catch (error) {
      console.error('\n❌ Error in auto-advance check:', error.message);
      throw error;
    }
  }

  // ===========================================================================
  //  SURVIVOR PLAYOFF TIEBREAKER METHODS
  // ===========================================================================

  /**
   * 1.1 — Initialize the playoff tiebreaker system for a contest.
   * Creates status row + participant rows from surviving regular-season participants.
   * Must be called inside an existing transaction (client passed in) or standalone.
   */
  static async initializeTiebreaker(contestId, client = null) {
    const ownClient = !client;
    if (ownClient) client = await pool.connect();

    try {
      if (ownClient) await client.query('BEGIN');

      // Get contest info for season
      const contestRes = await client.query(
        'SELECT season_year FROM contests WHERE contest_id = $1', [contestId]
      );
      if (contestRes.rows.length === 0) throw new Error('Contest not found');

      const seasonYear = contestRes.rows[0].season_year; // e.g. "2025-26"
      const startYear = parseInt(seasonYear.split('-')[0]);
      const season = startYear * 10000 + (startYear + 1); // e.g. 20252026

      // Insert tiebreaker status (idempotent via ON CONFLICT)
      await client.query(`
        INSERT INTO survivor_playoff_tiebreaker_status (
          contest_id, is_active, current_round, current_game_number,
          season, max_game_number_for_round, round_started_at
        ) VALUES ($1, TRUE, 1, 1, $2, 4, NOW())
        ON CONFLICT (contest_id) DO NOTHING
      `, [contestId, season]);

      // Insert tiebreaker participants from non-eliminated survivors
      const participantsRes = await client.query(`
        INSERT INTO survivor_playoff_tiebreaker_participants (
          contest_id, user_id, participant_id, is_eliminated
        )
        SELECT sp.contest_id, sp.user_id, sp.id, FALSE
        FROM survivor_participants sp
        WHERE sp.contest_id = $1 AND sp.is_eliminated = FALSE
        ON CONFLICT (contest_id, user_id) DO NOTHING
        RETURNING *
      `, [contestId]);

      const count = participantsRes.rowCount;
      console.log(`✅ Tiebreaker initialized: ${count} participants entered for contest ${contestId}`);

      if (ownClient) await client.query('COMMIT');

      return { contest_id: contestId, participants_entered: count, round: 1, game_number: 1 };
    } catch (error) {
      if (ownClient) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (ownClient) client.release();
    }
  }

  /**
   * 1.2 — Get current tiebreaker status for a contest.
   */
  static async getTiebreakerStatus(contestId) {
    const statusRes = await pool.query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM survivor_playoff_tiebreaker_participants
         WHERE contest_id = $1 AND is_eliminated = FALSE) as active_participants,
        (SELECT COUNT(*) FROM survivor_playoff_tiebreaker_participants
         WHERE contest_id = $1 AND is_eliminated = TRUE) as eliminated_participants
      FROM survivor_playoff_tiebreaker_status s
      WHERE s.contest_id = $1
    `, [contestId]);

    if (statusRes.rows.length === 0) return null;

    const status = statusRes.rows[0];

    // Get active series for the current round
    const seriesRes = await pool.query(`
      SELECT ps.*
      FROM playoff_series ps
      WHERE ps.round = $1 AND ps.season = $2
      ORDER BY ps.series_letter
    `, [status.current_round, status.season]);

    const window = await this.getTiebreakerWindow(status.season, status.current_round, status.current_game_number);

    return {
      ...status,
      ...window,
      active_series: seriesRes.rows
    };
  }

  static async getTiebreakerWindow(season, round, gameNumber, client = pool) {
    const { rows } = await client.query(`
      SELECT MIN(g.start_time_utc) AS lock_time,
        COALESCE(BOOL_OR(g.start_time_utc <= clock_timestamp() OR g.game_state IN ('LIVE', 'OFF', 'FINAL')), FALSE) AS is_locked,
        COUNT(DISTINCT ps.series_id)::integer AS series_count,
        COUNT(DISTINCT g.game_id)::integer AS game_count,
        COALESCE(BOOL_AND(g.game_id IS NOT NULL AND g.game_state IN ('OFF', 'FINAL')), FALSE) AS games_finished
      FROM playoff_series ps LEFT JOIN games g ON g.series_id = ps.series_id
        AND g.game_number_in_series = $3 AND g.game_type = 3
      WHERE ps.season = $1 AND ps.round = $2
    `, [season, round, gameNumber]);
    const window = rows[0];
    return { ...window, all_complete: window.games_finished && window.series_count === 2 ** (4 - round)
      && window.game_count === window.series_count };
  }

  static async checkAndAutoAdvancePlayoffs() {
    const { rows } = await pool.query(`SELECT s.* FROM survivor_playoff_tiebreaker_status s
      JOIN contests c USING (contest_id) WHERE s.is_active = TRUE AND c.status = 'in_progress' AND c.phase = 'playoff_tiebreaker'`);
    for (const status of rows) {
      const window = await this.getTiebreakerWindow(status.season, status.current_round, status.current_game_number);
      if (window.all_complete) {
        try { await this.advanceTiebreakerGame(status.contest_id); }
        catch (error) { console.error(`Playoff advancement failed for contest ${status.contest_id}: ${error.message}`); }
      }
    }
  }

  /**
   * 1.3 — Get available teams for a tiebreaker pick.
   * Rules:
   *  - R1-R2: playoff teams minus used (counts_as_used = TRUE)
   *  - R3: fresh slate (reset usage), playoff teams minus used in R3
   *  - R4 (SCF): both teams always available
   */
  static async getAvailableTeamsForTiebreaker(contestId, userId) {
    const { rows: statuses } = await pool.query('SELECT * FROM survivor_playoff_tiebreaker_status WHERE contest_id = $1', [contestId]);
    const status = statuses[0];
    if (!status?.is_active) throw new Error('Tiebreaker is not active');
    const { rows: participants } = await pool.query(`SELECT * FROM survivor_playoff_tiebreaker_participants
      WHERE contest_id = $1 AND user_id = $2`, [contestId, userId]);
    const participant = participants[0];
    if (!participant || participant.is_eliminated) throw new Error('You are not an active tiebreaker participant');
    const { rows: used } = await pool.query(`SELECT team_id FROM survivor_playoff_tiebreaker_team_usage
      WHERE tiebreaker_participant_id = $1 AND counts_as_used = TRUE
        AND NOT (used_in_round = $2 AND used_in_game_number = $3)`,
    [participant.tiebreaker_participant_id, status.current_round, status.current_game_number]);
    const usedIds = new Set(status.current_round === 4 ? [] : used.map(t => t.team_id));
    const { rows: series } = await pool.query(`SELECT ps.*, t1.team_name AS top_name, t2.team_name AS bottom_name,
      (SELECT MIN(start_time_utc) FROM games WHERE series_id = ps.series_id AND game_number_in_series = $3) AS start_time,
      EXISTS (SELECT 1 FROM games WHERE series_id = ps.series_id AND game_number_in_series = $3
        AND (start_time_utc <= clock_timestamp() OR game_state IN ('LIVE', 'OFF', 'FINAL'))) AS game_started
      FROM playoff_series ps JOIN nhl_teams t1 ON t1.team_id = ps.top_seed_team_id
        JOIN nhl_teams t2 ON t2.team_id = ps.bottom_seed_team_id
      WHERE ps.season = $1 AND ps.round = $2 AND ps.is_completed = FALSE ORDER BY ps.series_letter`,
    [status.season, status.current_round, status.current_game_number]);
    const teams = series.flatMap(s => ['top', 'bottom'].map(seed => ({
      team_id: s[`${seed}_seed_team_id`], abbreviation: s[`${seed}_seed_team_abbrev`],
      team_name: s[`${seed}_name`], series_id: s.series_id, series_round: s.round,
      start_time: s.start_time, game_started: s.game_started,
      is_available: !usedIds.has(s[`${seed}_seed_team_id`]),
    })));
    return { round: status.current_round, game_number: status.current_game_number, teams, is_scf: status.current_round === 4 };
  }
  /**
   * 1.4 — Submit a tiebreaker pick.
   */
  static async submitTiebreakerPick(contestId, userId, seriesId, teamId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get status
      const statusRes = await client.query(
        "SELECT s.* FROM survivor_playoff_tiebreaker_status s JOIN contests c USING (contest_id) WHERE s.contest_id = $1 AND c.status = 'in_progress' AND c.phase = 'playoff_tiebreaker' FOR UPDATE OF c, s",
        [contestId]
      );
      if (statusRes.rows.length === 0 || !statusRes.rows[0].is_active) {
        throw new Error('Tiebreaker not active');
      }
      const status = statusRes.rows[0];

      // Get participant
      const partRes = await client.query(
        `SELECT * FROM survivor_playoff_tiebreaker_participants
         WHERE contest_id = $1 AND user_id = $2`,
        [contestId, userId]
      );
      if (partRes.rows.length === 0) throw new Error('You are not in this tiebreaker');
      const participant = partRes.rows[0];
      if (participant.is_eliminated) throw new Error('You have been eliminated');

      // Validate series exists and is in the correct round
      const seriesRes = await client.query(
        'SELECT * FROM playoff_series WHERE series_id = $1', [seriesId]
      );
      if (seriesRes.rows.length === 0) throw new Error('Invalid series');
      const series = seriesRes.rows[0];

      // For rounds 1-2, series must be round 1 or 2; for round 3, series round 3; for SCF, round 4
      if (series.round !== status.current_round || series.season !== status.season || series.is_completed) {
        throw new Error(`Series is not in the current playoff round`);
      }

      // Validate team is one of the two in the series
      if (teamId !== series.top_seed_team_id && teamId !== series.bottom_seed_team_id) {
        throw new Error('Team is not part of this series');
      }

      // Check if the game for this series has already started (lock enforcement)
      const gameTimeRes = await client.query(`
        SELECT start_time_utc, game_state, clock_timestamp() AS now
        FROM games
        WHERE series_id = $1 AND game_number_in_series = $2 AND game_type = 3
        LIMIT 1
      `, [seriesId, status.current_game_number]);

      let isLocked = false;
      if (gameTimeRes.rows.length > 0) {
        const game = gameTimeRes.rows[0];
        const now = new Date(game.now);
        isLocked = (game.start_time_utc && new Date(game.start_time_utc) <= now)
                || ['LIVE', 'OFF', 'FINAL'].includes(game.game_state);
      }
      if (!gameTimeRes.rows.length || !gameTimeRes.rows[0].start_time_utc) throw new Error('This game has not been scheduled yet');
      if (isLocked) throw new Error('This game has already started. Choose an unstarted game');
      const window = await this.getTiebreakerWindow(status.season, status.current_round, status.current_game_number, client);

      // Check if participant already has a pick for this round/game
      const existingPickRes = await client.query(`
        SELECT pick_id, is_locked FROM survivor_playoff_tiebreaker_picks
        WHERE tiebreaker_participant_id = $1 AND round = $2 AND game_number = $3
      `, [participant.tiebreaker_participant_id, status.current_round, status.current_game_number]);

      if (existingPickRes.rows.length > 0 && (existingPickRes.rows[0].is_locked || window.is_locked)) {
        throw new Error('Your pick is locked — the game has already started');
      }

      // Validate team is available (SCF = always available)
      if (status.current_round !== 4) {
        const usageRes = await client.query(`
          SELECT 1 FROM survivor_playoff_tiebreaker_team_usage
          WHERE tiebreaker_participant_id = $1 AND team_id = $2 AND counts_as_used = TRUE
            AND NOT (used_in_round = $3 AND used_in_game_number = $4)
        `, [participant.tiebreaker_participant_id, teamId, status.current_round, status.current_game_number]);
        if (usageRes.rows.length > 0) {
          throw new Error('You have already used this team');
        }
      }

      // Get team abbreviation
      const teamRes = await client.query(
        'SELECT abbreviation FROM nhl_teams WHERE team_id = $1', [teamId]
      );
      const teamAbbrev = teamRes.rows[0]?.abbreviation || '';

      // Check if pick already exists for this round/game (upsert)
      const pickRes = await client.query(`
        INSERT INTO survivor_playoff_tiebreaker_picks (
          tiebreaker_participant_id, contest_id, round, game_number,
          series_id, picked_team_id, picked_team_abbrev, is_locked, locked_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (tiebreaker_participant_id, round, game_number)
        DO UPDATE SET
          series_id = EXCLUDED.series_id,
          picked_team_id = EXCLUDED.picked_team_id,
          picked_team_abbrev = EXCLUDED.picked_team_abbrev,
          is_locked = CASE WHEN survivor_playoff_tiebreaker_picks.is_locked THEN TRUE ELSE EXCLUDED.is_locked END,
          locked_at = CASE WHEN survivor_playoff_tiebreaker_picks.is_locked THEN survivor_playoff_tiebreaker_picks.locked_at ELSE EXCLUDED.locked_at END,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [
        participant.tiebreaker_participant_id, contestId,
        status.current_round, status.current_game_number,
        seriesId, teamId, teamAbbrev,
        isLocked, isLocked ? new Date() : null
      ]);

      const pick = pickRes.rows[0];

      // Record team usage (skip for SCF — both teams always available)
      if (status.current_round !== 4) {
        // Delete old usage for this round/game if changing pick
        await client.query(`
          DELETE FROM survivor_playoff_tiebreaker_team_usage
          WHERE tiebreaker_participant_id = $1
            AND used_in_round = $2 AND used_in_game_number = $3
        `, [participant.tiebreaker_participant_id, status.current_round, status.current_game_number]);

        await client.query(`
          INSERT INTO survivor_playoff_tiebreaker_team_usage (
            tiebreaker_participant_id, contest_id, team_id, team_abbrev,
            used_in_round, used_in_game_number, pick_id, counts_as_used
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
        `, [
          participant.tiebreaker_participant_id, contestId,
          teamId, teamAbbrev,
          status.current_round, status.current_game_number, pick.pick_id
        ]);
      }

      await client.query('COMMIT');
      return pick;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 1.5 — Process results for the current tiebreaker game.
   * Matches picks against actual game results, applies elimination.
   */
  static async processTiebreakerGameResults(contestId, transactionClient = null) {
    const client = transactionClient || await pool.connect();
    try {
      if (!transactionClient) await client.query('BEGIN');

      // Get status
      const statusRes = await client.query(
        "SELECT s.* FROM survivor_playoff_tiebreaker_status s JOIN contests c USING (contest_id) WHERE s.contest_id = $1 AND c.status = 'in_progress' AND c.phase = 'playoff_tiebreaker' FOR UPDATE OF c, s",
        [contestId]
      );
      if (statusRes.rows.length === 0 || !statusRes.rows[0].is_active) {
        throw new Error('Tiebreaker not active');
      }
      const status = statusRes.rows[0];
      const { current_round, current_game_number } = status;
      const window = await this.getTiebreakerWindow(status.season, current_round, current_game_number, client);
      if (!window.all_complete) {
        if (!transactionClient) await client.query('COMMIT');
        return { status: 'pending', round: current_round, game_number: current_game_number,
          message: 'All series games for this pick must finish before processing results' };
      }

      console.log(`\n⚡ Processing tiebreaker results: Round ${current_round}, Game ${current_game_number}`);

      // Get all active tiebreaker participants
      const activePartsRes = await client.query(`
        SELECT * FROM survivor_playoff_tiebreaker_participants
        WHERE contest_id = $1 AND is_eliminated = FALSE
      `, [contestId]);
      const activeParticipants = activePartsRes.rows;

      // Get all picks for this round/game
      const picksRes = await client.query(`
        SELECT p.*, tp.user_id, tp.tiebreaker_participant_id
        FROM survivor_playoff_tiebreaker_picks p
        JOIN survivor_playoff_tiebreaker_participants tp
          ON p.tiebreaker_participant_id = tp.tiebreaker_participant_id
        WHERE p.contest_id = $1 AND p.round = $2 AND p.game_number = $3
          AND tp.is_eliminated = FALSE
      `, [contestId, current_round, current_game_number]);
      const picks = picksRes.rows;

      // Detect no-pick participants
      const pickParticipantIds = new Set(picks.map(p => p.tiebreaker_participant_id));
      const noPickParticipants = activeParticipants.filter(
        p => !pickParticipantIds.has(p.tiebreaker_participant_id)
      );

      // For each pick, find the actual game result
      const results = [];
      for (const pick of picks) {
        // Find the game: match series_id + game_number_in_series
        const gameRes = await client.query(`
          SELECT g.game_id, g.result, g.team_id, g.game_state
          FROM games g
          WHERE g.series_id = $1
            AND g.game_number_in_series = $2
            AND g.team_id = $3
            AND g.game_type = 3
          LIMIT 1
        `, [pick.series_id, current_game_number, pick.picked_team_id]);

        let isCorrect = null;
        let gameId = null;

        if (gameRes.rows.length > 0) {
          const game = gameRes.rows[0];
          gameId = game.game_id;
          if (['OFF', 'FINAL'].includes(game.game_state) && ['W', 'L', 'OTL'].includes(game.result)) {
            isCorrect = game.result === 'W';
          }
          // If game not finished, isCorrect stays null
        }

        if (pick.is_correct_override !== null && pick.is_correct_override !== undefined) isCorrect = pick.is_correct_override;

        // Update pick with result
        await client.query(`
          UPDATE survivor_playoff_tiebreaker_picks
          SET is_correct = $1, game_id = $2, updated_at = CURRENT_TIMESTAMP
          WHERE pick_id = $3
        `, [isCorrect, gameId, pick.pick_id]);

        results.push({
          tiebreaker_participant_id: pick.tiebreaker_participant_id,
          user_id: pick.user_id,
          picked_team_abbrev: pick.picked_team_abbrev,
          is_correct: isCorrect,
          no_pick: false
        });
      }

      // Add no-pick participants as incorrect
      for (const np of noPickParticipants) {
        results.push({
          tiebreaker_participant_id: np.tiebreaker_participant_id,
          user_id: np.user_id,
          picked_team_abbrev: 'NO PICK',
          is_correct: false,
          no_pick: true
        });
      }

      // Check if all games resolved (no nulls except no-picks)
      const hasUnresolved = results.some(r => r.is_correct === null && !r.no_pick);
      if (hasUnresolved) {
        if (!transactionClient) await client.query('COMMIT');
        return {
          round: current_round, game_number: current_game_number,
          status: 'pending', message: 'Not all games have finished yet',
          results
        };
      }

      // Apply elimination logic
      const correctPicks = results.filter(r => r.is_correct === true);
      const incorrectPicks = results.filter(r => r.is_correct === false || r.no_pick);
      const participantsToEliminate = [];

      // No-picks always eliminated
      for (const np of noPickParticipants) {
        participantsToEliminate.push(np.tiebreaker_participant_id);
      }

      let massProtection = false;

      if (correctPicks.length === 0 && incorrectPicks.length > 0) {
        // ALL failed (excluding no-picks who are always eliminated)
        const pickedIncorrect = incorrectPicks.filter(r => !r.no_pick);
        if (pickedIncorrect.length > 0 && correctPicks.length === 0) {
          // Mass protection: everyone who picked survives
          console.log(`   🛡️  Mass elimination protection: all picks lost, everyone survives`);
          massProtection = true;
        }
      } else if (correctPicks.length > 0) {
        // Some correct — eliminate those who picked incorrectly (not no-picks, already added)
        for (const r of incorrectPicks) {
          if (!r.no_pick && !participantsToEliminate.includes(r.tiebreaker_participant_id)) {
            participantsToEliminate.push(r.tiebreaker_participant_id);
          }
        }
      }

      // Execute eliminations
      for (const tpId of participantsToEliminate) {
        await client.query(`
          UPDATE survivor_playoff_tiebreaker_participants
          SET is_eliminated = TRUE, eliminated_at = NOW(),
              eliminated_in_round = $1, eliminated_in_game_number = $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE tiebreaker_participant_id = $3
        `, [current_round, current_game_number, tpId]);
      }
      await client.query(`UPDATE survivor_participants sp SET is_eliminated = TRUE
        FROM survivor_playoff_tiebreaker_participants tp
        WHERE tp.contest_id = $1 AND tp.is_eliminated = TRUE AND sp.id = tp.participant_id`, [contestId]);
      await client.query(`UPDATE survivor_playoff_tiebreaker_picks SET is_locked = TRUE
        WHERE contest_id = $1 AND round = $2 AND game_number = $3`, [contestId, current_round, current_game_number]);

      // Check remaining count
      const remainingRes = await client.query(`
        SELECT COUNT(*) as count FROM survivor_playoff_tiebreaker_participants
        WHERE contest_id = $1 AND is_eliminated = FALSE
      `, [contestId]);
      const remainingCount = parseInt(remainingRes.rows[0].count);

      let winnerDetermined = false;
      const { rows: finalSeries } = await client.query(`SELECT is_completed FROM playoff_series
        WHERE season = $1 AND round = 4`, [status.season]);
      const splitPrize = current_round === 4 && remainingCount > 1 &&
        (current_game_number === 7 || finalSeries.some(series => series.is_completed));

      if (remainingCount === 1 || splitPrize) {
        // Single winner
        await client.query(`
          UPDATE survivor_playoff_tiebreaker_participants
          SET is_winner = TRUE, won_at = NOW(), updated_at = CURRENT_TIMESTAMP
          WHERE contest_id = $1 AND is_eliminated = FALSE
        `, [contestId]);

        // Also record winner in the main survivor_participants table
        await client.query(`
          UPDATE survivor_participants sp
          SET placement = 1
          FROM survivor_playoff_tiebreaker_participants tp
          WHERE tp.contest_id = $1 AND tp.is_eliminated = FALSE
            AND tp.participant_id = sp.id
        `, [contestId]);

        await client.query(`
          UPDATE contests SET status = 'completed', updated_at = NOW()
          WHERE contest_id = $1
        `, [contestId]);

        await client.query(`
          UPDATE survivor_playoff_tiebreaker_status
          SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
          WHERE contest_id = $1
        `, [contestId]);

        winnerDetermined = true;
        console.log(`   🏆 Tiebreaker winner determined!`);
      } else if (remainingCount === 0) {
        // Everyone eliminated — shouldn't happen with mass protection, but handle
        await client.query(`
          UPDATE contests SET status = 'completed', updated_at = NOW()
          WHERE contest_id = $1
        `, [contestId]);
        await client.query(`
          UPDATE survivor_playoff_tiebreaker_status
          SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
          WHERE contest_id = $1
        `, [contestId]);
        console.log(`   ⚠️  All tiebreaker participants eliminated`);
      }

      if (!transactionClient) await client.query('COMMIT');

      return {
        round: current_round, game_number: current_game_number,
        status: splitPrize ? 'split_prize' : winnerDetermined ? 'winner_determined' : 'processed',
        eliminated: participantsToEliminate.length,
        remaining: remainingCount,
        mass_protection: massProtection,
        winner_determined: winnerDetermined,
        results
      };
    } catch (error) {
      if (!transactionClient) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (!transactionClient) client.release();
    }
  }

  /**
   * 1.6 — Advance to the next tiebreaker game or round.
   */
  static async advanceTiebreakerGame(contestId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const statusRes = await client.query(
        "SELECT s.* FROM survivor_playoff_tiebreaker_status s JOIN contests c USING (contest_id) WHERE s.contest_id = $1 AND c.status = 'in_progress' AND c.phase = 'playoff_tiebreaker' FOR UPDATE OF c, s",
        [contestId]
      );
      if (statusRes.rows.length === 0 || !statusRes.rows[0].is_active) {
        throw new Error('Tiebreaker not active');
      }
      const status = statusRes.rows[0];
      let { current_round, current_game_number, max_game_number_for_round } = status;

      const result = await this.processTiebreakerGameResults(contestId, client);
      if (result.status === 'pending') throw new Error(result.message);
      if (result.winner_determined || result.remaining === 0) {
        await client.query('COMMIT');
        return { action: result.status, ...result };
      }

      const nextGame = current_game_number + 1;

      if (nextGame <= max_game_number_for_round) {
        // Stay in same round, advance game number
        await client.query(`
          UPDATE survivor_playoff_tiebreaker_status
          SET current_game_number = $1, updated_at = CURRENT_TIMESTAMP
          WHERE contest_id = $2
        `, [nextGame, contestId]);
        await client.query('UPDATE contests SET playoff_game_number = $1 WHERE contest_id = $2', [nextGame, contestId]);

        await client.query('COMMIT');
        return {
          action: 'advanced_game',
          round: current_round, game_number: nextGame,
          message: `Advanced to Round ${current_round}, Game ${nextGame}`
        };
      }

      // Exceeded max game for this round — advance to next round
      const nextRound = current_round + 1;

      if (nextRound > 4) {
        // Past SCF — split prize
        await client.query(`
          UPDATE survivor_playoff_tiebreaker_status
          SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
          WHERE contest_id = $1
        `, [contestId]);

        await client.query(`
          UPDATE contests SET status = 'completed', updated_at = NOW()
          WHERE contest_id = $1
        `, [contestId]);

        await client.query('COMMIT');
        return {
          action: 'split_prize',
          message: 'SCF finished with no single winner — prize split among remaining participants'
        };
      }

      // Reset team usage for Round 3 (fresh slate)
      if (nextRound === 3) {
        await client.query(`
          UPDATE survivor_playoff_tiebreaker_team_usage
          SET counts_as_used = FALSE
          WHERE contest_id = $1
        `, [contestId]);
        console.log(`   🔄 Fresh slate: Reset team usage for Round 3`);
      }

      const newMaxGame = nextRound === 4 ? 7 : 4;

      await client.query(`
        UPDATE survivor_playoff_tiebreaker_status
        SET current_round = $1, current_game_number = 1,
            max_game_number_for_round = $2,
            round_started_at = NOW(), updated_at = CURRENT_TIMESTAMP
        WHERE contest_id = $3
      `, [nextRound, newMaxGame, contestId]);
      await client.query('UPDATE contests SET playoff_round = $1, playoff_game_number = 1 WHERE contest_id = $2', [nextRound, contestId]);

      await client.query('COMMIT');

      const roundNames = { 1: '1st Round', 2: '2nd Round', 3: 'Conference Finals', 4: 'Stanley Cup Final' };
      return {
        action: 'advanced_round',
        previous_round: current_round,
        round: nextRound, game_number: 1,
        fresh_slate: nextRound === 3,
        message: `Advanced to ${roundNames[nextRound]}, Game 1`
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 1.7 — Get tiebreaker picks for a specific round/game.
   * Visibility: locked picks are visible, unlocked only own pick.
   */
  static async getTiebreakerPicks(contestId, round, gameNumber, userId) {
    const { rows: statuses } = await pool.query('SELECT season FROM survivor_playoff_tiebreaker_status WHERE contest_id = $1', [contestId]);
    if (!statuses.length) throw new Error('Tiebreaker not active for this contest');
    const window = await this.getTiebreakerWindow(statuses[0].season, round, gameNumber);
    // Get all picks for this round/game
    const picksRes = await pool.query(`
      SELECT p.*,
        tp.user_id, tp.is_eliminated,
        sp.participant_name
      FROM survivor_playoff_tiebreaker_picks p
      JOIN survivor_playoff_tiebreaker_participants tp
        ON p.tiebreaker_participant_id = tp.tiebreaker_participant_id
      JOIN survivor_participants sp ON tp.participant_id = sp.id
      WHERE p.contest_id = $1 AND p.round = $2 AND p.game_number = $3
      ORDER BY sp.participant_name
    `, [contestId, round, gameNumber]);

    // Check if any pick is locked (game started)
    const anyLocked = window.is_locked || picksRes.rows.some(p => p.is_locked);

    // Check if user has submitted a pick
    const userPick = picksRes.rows.find(p => p.user_id === userId);
    const canSeePicks = anyLocked && !!userPick;

    if (!canSeePicks) {
      return {
        round, game_number: gameNumber,
        can_see_picks: false,
        picks: [],
        user_pick: userPick || null,
        message: 'Picks visible after lock and after you submit yours'
      };
    }

    return {
      round, game_number: gameNumber,
      can_see_picks: true,
      picks: picksRes.rows,
      user_pick: userPick || null
    };
  }
}

module.exports = SurvivorService;
