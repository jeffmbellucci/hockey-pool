const pool = require('../config/database');

class Contest {
  static async getCurrentSurvivorWeek() {
    const { rows } = await pool.query(`SELECT c.contest_id, c.season_year, c.phase, c.status, c.current_week, sw.start_date, sw.end_date
      FROM contests c LEFT JOIN survivor_weeks sw ON sw.contest_id = c.contest_id AND sw.week_number = c.current_week
      WHERE c.contest_type = 'survivor' AND c.status IN ('in_progress', 'waiting')
      ORDER BY (c.status = 'in_progress') DESC, c.created_at DESC LIMIT 1`);
    return rows[0] || { current_week: 1, start_date: null, end_date: null };
  }

  // Create a new contest
  static async create(contestName, seasonYear, contestType = 'two_team', maxParticipants = 16) {
    const query = `
      INSERT INTO contests (contest_name, season_year, contest_type, max_participants, status)
      VALUES ($1, $2, $3, $4, 'waiting')
      RETURNING *
    `;
    const { rows } = await pool.query(query, [contestName, seasonYear, contestType, maxParticipants]);
    return rows[0];
  }

  // Get all contests
  static async findAll() {
    const query = `
      SELECT * FROM contests
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query);
    return rows;
  }

  // Get contest by ID
  static async findById(contestId, client = pool) {
    const query = 'SELECT * FROM contests WHERE contest_id = $1';
    const { rows } = await client.query(query, [contestId]);
    return rows[0];
  }

  // Get active contest (waiting or drafting or in_progress, or most recent completed)
  // If a two_team contest has a tiebreaker, return the tiebreaker instead
  static async findActive(contestType = 'two_team') {
    const query = `
      SELECT * FROM contests 
      WHERE contest_type = $1 
        AND status IN ('waiting', 'drafting', 'in_progress', 'completed')
      ORDER BY 
        CASE 
          WHEN status = 'in_progress' THEN 1
          WHEN status = 'drafting' THEN 2
          WHEN status = 'waiting' THEN 3
          WHEN status = 'completed' THEN 4
        END,
        completed_at DESC,
        created_at DESC
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [contestType]);
    const contest = rows[0];
    
    // If this is a two_team contest, check if it has a tiebreaker
    if (contest && contestType === 'two_team') {
      const tiebreakerQuery = `
        SELECT * FROM contests
        WHERE parent_contest_id = $1
        AND contest_type = 'playoff_tiebreaker'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const { rows: tiebreakerRows } = await pool.query(tiebreakerQuery, [contest.contest_id]);
      
      // If a tiebreaker exists, return it instead of the original contest
      if (tiebreakerRows.length > 0) {
        return tiebreakerRows[0];
      }
    }
    
    return contest;
  }

  // Get contest by season and type
  static async findBySeasonAndType(seasonYear, contestType = 'two_team') {
    const query = `
      SELECT * FROM contests 
      WHERE season_year = $1 AND contest_type = $2
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [seasonYear, contestType]);
    return rows[0];
  }

  // Update contest
  static async update(contestId, data) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (data.contest_name !== undefined) {
      fields.push(`contest_name = $${paramCount}`);
      values.push(data.contest_name);
      paramCount++;
    }

    if (data.season_year !== undefined) {
      fields.push(`season_year = $${paramCount}`);
      values.push(data.season_year);
      paramCount++;
    }

    if (data.max_participants !== undefined) {
      fields.push(`max_participants = $${paramCount}`);
      values.push(data.max_participants);
      paramCount++;
    }

    if (data.status !== undefined) {
      const VALID_STATUSES = ['waiting', 'drafting', 'in_progress', 'completed'];
      if (!VALID_STATUSES.includes(data.status)) {
        throw new Error(`Invalid contest status: ${data.status}`);
      }
      fields.push(`status = $${paramCount}`);
      values.push(data.status);
      paramCount++;
    }

    if (data.current_participants !== undefined) {
      fields.push(`current_participants = $${paramCount}`);
      values.push(data.current_participants);
      paramCount++;
    }

    if (data.draft_order !== undefined) {
      fields.push(`draft_order = $${paramCount}`);
      values.push(JSON.stringify(data.draft_order));
      paramCount++;
    }

    if (data.current_draft_pick !== undefined) {
      fields.push(`current_draft_pick = $${paramCount}`);
      values.push(data.current_draft_pick);
      paramCount++;
    }

    if (data.started_at !== undefined) {
      fields.push(`started_at = $${paramCount}`);
      values.push(data.started_at);
      paramCount++;
    }

    if (data.completed_at !== undefined) {
      fields.push(`completed_at = $${paramCount}`);
      values.push(data.completed_at);
      paramCount++;
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(contestId);
    const query = `
      UPDATE contests 
      SET ${fields.join(', ')}
      WHERE contest_id = $${paramCount}
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);
    return rows[0];
  }

  // Update participant count
  static async updateParticipantCount(contestId) {
    const query = `
      UPDATE contests 
      SET current_participants = (
        SELECT COUNT(*) FROM pool_participants 
        WHERE contest_id = $1 AND active = TRUE
      )
      WHERE contest_id = $1
      RETURNING *
    `;
    const { rows } = await pool.query(query, [contestId]);
    return rows[0];
  }

  static async randomizeDraftOrder(contestId, transactionClient = null) {
    const client = transactionClient || await pool.connect();
    try {
      if (!transactionClient) await client.query('BEGIN');
      const { rows: contests } = await client.query('SELECT * FROM contests WHERE contest_id = $1 FOR UPDATE', [contestId]);
      if (!contests[0] || contests[0].status !== 'waiting') throw new Error('Only waiting contests can be randomized');
      const { rows: participants } = await client.query(`
        SELECT participant_id, participant_name FROM pool_participants
        WHERE contest_id = $1 AND active = TRUE ORDER BY participant_id
      `, [contestId]);
      if (!participants.length) throw new Error('No participants found for this contest');
      for (let i = participants.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [participants[i], participants[j]] = [participants[j], participants[i]];
      }
      // Unique draft-order constraints are immediate, so vacate positive slots before swapping.
      await client.query('UPDATE pool_participants SET draft_order = -draft_order WHERE contest_id = $1', [contestId]);
      for (let i = 0; i < participants.length; i++) {
        await client.query('UPDATE pool_participants SET draft_order = $1 WHERE participant_id = $2', [i + 1, participants[i].participant_id]);
      }
      await client.query('UPDATE contests SET draft_order = $1 WHERE contest_id = $2',
        [JSON.stringify(participants.map(p => p.participant_id)), contestId]);
      if (!transactionClient) await client.query('COMMIT');
      return participants.map((p, i) => ({ ...p, draft_order: i + 1 }));
    } catch (error) {
      if (!transactionClient) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (!transactionClient) client.release();
    }
  }

  static async startDrafting(contestId, transactionClient = null) {
    const client = transactionClient || await pool.connect();
    try {
      if (!transactionClient) await client.query('BEGIN');
      const { rows } = await client.query('SELECT * FROM contests WHERE contest_id = $1 FOR UPDATE', [contestId]);
      const contest = rows[0];
      if (!contest || contest.status !== 'waiting') throw new Error('Contest is not in waiting status');
      const { rows: counts } = await client.query('SELECT COUNT(*)::integer AS count FROM pool_participants WHERE contest_id = $1 AND active = TRUE', [contestId]);
      if (counts[0].count !== contest.max_participants) throw new Error('Contest must have all participants before drafting');
      if (!contest.draft_order) await this.randomizeDraftOrder(contestId, client);
      const ready = await this.findById(contestId, client);
      const nextPick = await this.nextUnfilledDraftPick(ready, 1, client);
      const result = await client.query(`UPDATE contests SET status = $3, current_draft_pick = $4,
        started_at = NOW(), current_participants = $2 WHERE contest_id = $1 RETURNING *`,
      [contestId, counts[0].count, nextPick > this.getDraftSequence(ready).length ? 'in_progress' : 'drafting', nextPick]);
      if (!transactionClient) await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      if (!transactionClient) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (!transactionClient) client.release();
    }
  }

  // Start contest (after draft is complete)
  static async startContest(contestId) {
    const query = `
      UPDATE contests 
      SET status = 'in_progress'
      WHERE contest_id = $1
      RETURNING *
    `;
    const { rows } = await pool.query(query, [contestId]);
    return rows[0];
  }

  // Complete contest (with tiebreaker check for two_team contests)
  static async complete(contestId) {
    const contest = await this.findById(contestId);
    
    if (!contest) {
      throw new Error('Contest not found');
    }

    // For two_team contests, check for ties before completing
    if (contest.contest_type === 'two_team' && !contest.is_tiebreaker) {
      const TwoTeamPick = require('./TwoTeamPick');
      const leaderboard = await TwoTeamPick.getLeaderboard(contestId);
      
      if (leaderboard.length >= 2) {
        const topScore = leaderboard[0].total_wins;
        const tiedParticipants = leaderboard.filter(p => p.total_wins === topScore);
        
        // If there's a tie at the top, create a tiebreaker contest
        if (tiedParticipants.length >= 2 && tiedParticipants.length <= 4) {
          return await this.createTiebreakerContest(contestId, tiedParticipants);
        }
      }
    }

    // No tie or tie resolution not applicable, complete the contest
    const query = `
      UPDATE contests 
      SET status = 'completed',
          completed_at = NOW()
      WHERE contest_id = $1
      RETURNING *
    `;
    const { rows } = await pool.query(query, [contestId]);
    return rows[0];
  }

  // Create tiebreaker playoff contest
  static async createTiebreakerContest(parentContestId, tiedParticipants) {
    const parentContest = await this.findById(parentContestId);
    const numParticipants = tiedParticipants.length;
    
    let tiebreakerType;
    let draftOrder;
    let excludedTeamId = null;
    
    // Determine tiebreaker type and draft order
    if (numParticipants === 2) {
      tiebreakerType = '2_participant';
      // Draft order: 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1 (16 picks total, 8 per person)
      draftOrder = [1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1];
    } else if (numParticipants === 3) {
      tiebreakerType = '3_participant';
      // Draft order: 1, 2, 3, 3, 2, 1, 1, 2, 3, 3, 2, 1, then random for last 3 picks (15 picks total, 5 per person)
      // For now, let's make the last 3 picks random order
      const lastThree = [1, 2, 3];
      for (let i = lastThree.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lastThree[i], lastThree[j]] = [lastThree[j], lastThree[i]];
      }
      draftOrder = [1, 2, 3, 3, 2, 1, 1, 2, 3, 3, 2, 1, ...lastThree];
      
      // All 16 teams are available; the team left after 15 picks goes undrafted.
    } else if (numParticipants === 4) {
      tiebreakerType = '4_participant';
      // Draft order: 1, 2, 3, 4, 4, 3, 2, 1, 1, 2, 3, 4, 4, 3, 2, 1 (16 picks total, 4 per person)
      draftOrder = [1, 2, 3, 4, 4, 3, 2, 1, 1, 2, 3, 4, 4, 3, 2, 1];
    } else {
      throw new Error('Tiebreaker only supports 2-4 participants');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query('SELECT contest_id FROM contests WHERE contest_id = $1 FOR UPDATE', [parentContestId]);
      const { rows: existing } = await client.query(
        "SELECT contest_id FROM contests WHERE parent_contest_id = $1 AND contest_type = 'playoff_tiebreaker' AND status <> 'cancelled'", [parentContestId]);
      if (existing.length) {
        await client.query('COMMIT');
        return await this.getContestWithParticipants(existing[0].contest_id);
      }

      // First, complete the parent contest
      await client.query(
        `UPDATE contests SET status = 'completed', completed_at = NOW() WHERE contest_id = $1`,
        [parentContestId]
      );

      // Create the tiebreaker contest
      const contestQuery = `
        INSERT INTO contests (
          contest_name, season_year, contest_type, max_participants, 
          status, is_tiebreaker, parent_contest_id, tiebreaker_type, excluded_team_id
        )
        VALUES ($1, $2, 'playoff_tiebreaker', $3, 'waiting', TRUE, $4, $5, $6)
        RETURNING *
      `;
      const { rows: contestRows } = await client.query(contestQuery, [
        `${parentContest.contest_name} - Playoff Tiebreaker`,
        parentContest.season_year,
        numParticipants,
        parentContestId,
        tiebreakerType,
        excludedTeamId
      ]);
      const tiebreakerContest = contestRows[0];

      // Create participants in the tiebreaker contest
      const participantIds = [];
      for (let i = 0; i < tiedParticipants.length; i++) {
        const original = tiedParticipants[i];
        
        // Validate that user_id exists
        if (!original.user_id) {
          throw new Error(`Cannot create tiebreaker: participant ${original.participant_name} has no user_id`);
        }
        
        const participantQuery = `
          INSERT INTO pool_participants (participant_name, draft_order, user_id, contest_id)
          VALUES ($1, $2, $3, $4)
          RETURNING participant_id
        `;
        const { rows: pRows } = await client.query(participantQuery, [
          original.participant_name,
          i + 1, // Temporary draft order, will be randomized
          original.user_id,
          tiebreakerContest.contest_id
        ]);
        participantIds.push(pRows[0].participant_id);
      }

      // Randomize the participant order
      const shuffled = [...participantIds];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Update draft order with randomized order
      for (let i = 0; i < shuffled.length; i++) {
        await client.query(
          'UPDATE pool_participants SET draft_order = $1 WHERE participant_id = $2',
          [-(i + 1), shuffled[i]] // Negative to avoid unique constraint
        );
      }
      for (let i = 0; i < shuffled.length; i++) {
        await client.query(
          'UPDATE pool_participants SET draft_order = $1 WHERE participant_id = $2',
          [i + 1, shuffled[i]]
        );
      }

      // Store the draft order array in the contest
      await client.query(
        'UPDATE contests SET draft_order = $1, current_participants = $2, tiebreaker_pick_order = $4 WHERE contest_id = $3',
        [JSON.stringify(shuffled), numParticipants, tiebreakerContest.contest_id,
          JSON.stringify(draftOrder.map(position => shuffled[position - 1]))]
      );

      // Create empty playoff picks for each participant
      const PlayoffPick = require('./PlayoffPick');
      for (const participantId of shuffled) {
        await client.query(
          'INSERT INTO playoff_picks (participant_id, contest_id, team_ids) VALUES ($1, $2, $3)',
          [participantId, tiebreakerContest.contest_id, []]
        );
      }

      await client.query('COMMIT');
      
      // Auto-start the tiebreaker contest since all participants are ready
      await this.startDrafting(tiebreakerContest.contest_id);
      
      return await this.getContestWithParticipants(tiebreakerContest.contest_id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Cancel contest
  static async cancel(contestId) {
    const query = `
      UPDATE contests 
      SET status = 'cancelled'
      WHERE contest_id = $1
      RETURNING *
    `;
    const { rows } = await pool.query(query, [contestId]);
    return rows[0];
  }

  // Resolve the complete, stable sequence of participant IDs for a draft.
  static getDraftSequence(contest) {
    const order = typeof contest.draft_order === 'string' ? JSON.parse(contest.draft_order) : contest.draft_order || [];
    if (contest.is_tiebreaker && contest.contest_type === 'playoff_tiebreaker') {
      if (contest.tiebreaker_pick_order) {
        return typeof contest.tiebreaker_pick_order === 'string'
          ? JSON.parse(contest.tiebreaker_pick_order) : contest.tiebreaker_pick_order;
      }
      // Preserve the sequence of tiebreakers created before the persisted sequence column.
      const patterns = {
        2: [1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1],
        3: [1, 2, 3, 3, 2, 1, 1, 2, 3, 3, 2, 1, 1, 2, 3],
        4: [1, 2, 3, 4, 4, 3, 2, 1, 1, 2, 3, 4, 4, 3, 2, 1],
      };
      const pattern = patterns[contest.max_participants];
      if (!pattern) throw new Error('Tiebreaker only supports 2-4 participants');
      return pattern.map(position => order[position - 1]);
    }
    return [...order, ...order.slice().reverse()];
  }

  static async getCurrentDraftPick(contestId, client = pool) {
    const contest = await this.findById(contestId, client);
    if (!contest || contest.status !== 'drafting') return null;
    const sequence = this.getDraftSequence(contest);
    const pickNumber = contest.current_draft_pick;
    if (pickNumber < 1 || pickNumber > sequence.length) return null;
    const { rows } = await client.query(`
      SELECT participant_id, participant_name, draft_order, user_id
      FROM pool_participants WHERE participant_id = $1 AND contest_id = $2 AND active = TRUE
    `, [sequence[pickNumber - 1], contestId]);
    if (!rows[0]) throw new Error('Draft participant is missing or inactive');
    return {
      contest_id: contestId, pick_number: pickNumber,
      round: Math.ceil(pickNumber / contest.max_participants),
      participant: rows[0], total_picks: sequence.length,
    };
  }

  static async nextUnfilledDraftPick(contest, from, client) {
    if (contest.contest_type !== 'two_team') return from;
    const sequence = this.getDraftSequence(contest);
    const { rows } = await client.query('SELECT participant_id, team1_id, team2_id FROM two_team_picks WHERE contest_id = $1', [contest.contest_id]);
    const picks = new Map(rows.map(p => [p.participant_id, p]));
    while (from <= sequence.length && picks.get(sequence[from - 1])?.[from <= contest.max_participants ? 'team1_id' : 'team2_id']) from++;
    return from;
  }

  // Pick, authorization, uniqueness, scoring, and turn advancement share one row lock.
  static async makeDraftPick(contestId, userId, teamId, isAdmin = false) {
    if (!Number.isInteger(teamId) || teamId < 1) throw new Error('Invalid team ID');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT * FROM contests WHERE contest_id = $1 FOR UPDATE', [contestId]);
      const contest = rows[0];
      if (!contest || contest.status !== 'drafting') throw new Error('Contest is not in drafting phase');
      const pickInfo = await this.getCurrentDraftPick(contestId, client);
      if (!pickInfo) throw new Error('No active draft pick');
      if (pickInfo.participant.user_id !== userId && !isAdmin) {
        throw Object.assign(new Error('It is not your turn to pick'), { statusCode: 403 });
      }
      const participantId = pickInfo.participant.participant_id;
      let pick;
      if (contest.is_tiebreaker && contest.contest_type === 'playoff_tiebreaker') {
        const PlayoffPick = require('./PlayoffPick');
        const available = await PlayoffPick.getAvailableTeams(contestId, client);
        if (!available.some(team => team.team_id === teamId)) throw new Error('This playoff team is not available');
        const result = await client.query(`
          UPDATE playoff_picks SET team_ids = array_append(team_ids, $1), updated_at = NOW()
          WHERE participant_id = $2 AND contest_id = $3 RETURNING *
        `, [teamId, participantId, contestId]);
        if (!result.rows[0]) throw new Error('Playoff pick record is missing');
        pick = await PlayoffPick.calculateAndUpdateWins(participantId, client);
      } else {
        const { rows: available } = await client.query(`
          SELECT team_id FROM nhl_teams WHERE team_id = $1 AND NOT EXISTS (
            SELECT 1 FROM two_team_picks WHERE contest_id = $2 AND (team1_id = $1 OR team2_id = $1)
          )
        `, [teamId, contestId]);
        if (!available.length) throw new Error('This team is invalid or already picked');
        if (pickInfo.round === 1) {
          await client.query(`INSERT INTO two_team_picks (participant_id, contest_id, team1_id)
            VALUES ($1, $2, $3)`, [participantId, contestId, teamId]);
        } else {
          const result = await client.query(`UPDATE two_team_picks SET team2_id = $1, updated_at = NOW()
            WHERE participant_id = $2 AND contest_id = $3 AND team2_id IS NULL RETURNING pick_id`,
          [teamId, participantId, contestId]);
          if (!result.rows[0]) throw new Error('Participant cannot receive another team');
        }
        pick = await require('./TwoTeamPick').calculateAndUpdateWins(participantId, client);
      }
      const nextPick = await this.nextUnfilledDraftPick(contest, contest.current_draft_pick + 1, client);
      await client.query(`UPDATE contests SET current_draft_pick = $1,
        status = CASE WHEN $1::integer > $2::integer THEN 'in_progress' ELSE 'drafting' END WHERE contest_id = $3`,
      [nextPick, pickInfo.total_picks, contestId]);
      const nextPickInfo = await this.getCurrentDraftPick(contestId, client);
      await client.query('COMMIT');
      return { pick, next_pick: nextPickInfo };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Delete contest
  static async delete(contestId) {
    const query = 'DELETE FROM contests WHERE contest_id = $1 RETURNING *';
    const { rows } = await pool.query(query, [contestId]);
    return rows[0];
  }

  // Get contest with participants
  static async getContestWithParticipants(contestId) {
    const contest = await this.findById(contestId);
    
    if (!contest) {
      return null;
    }

    const participantsQuery = `
      SELECT 
        pp.participant_id,
        pp.participant_name,
        pp.draft_order,
        pp.user_id,
        pp.active,
        u.email as user_email,
        u.name as user_name
      FROM pool_participants pp
      LEFT JOIN users u ON pp.user_id = u.id
      WHERE pp.contest_id = $1
      ORDER BY pp.draft_order
    `;
    const { rows: participants } = await pool.query(participantsQuery, [contestId]);

    // PostgreSQL JSONB type returns as object, not string
    // Only parse if it's a string (shouldn't happen with JSONB but checking for safety)
    let draftOrder = contest.draft_order;
    if (draftOrder && typeof draftOrder === 'string') {
      draftOrder = JSON.parse(draftOrder);
    }

    return {
      ...contest,
      draft_order: draftOrder,
      participants
    };
  }
}

module.exports = Contest;

