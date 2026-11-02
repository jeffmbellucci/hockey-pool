const pool = require('../config/database');

class PoolParticipant {
  // Create a new participant
  static async create(participantName, draftOrder, userId = null, contestId = null) {
    const query = `
      INSERT INTO pool_participants (participant_name, draft_order, user_id, contest_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const { rows } = await pool.query(query, [participantName, draftOrder, userId, contestId]);
    return rows[0];
  }

  // Get all participants (optionally filter by contest)
  static async findAll(contestId = null) {
    let query = `
      SELECT 
        pp.*,
        u.email as user_email,
        u.name as user_name
      FROM pool_participants pp
      LEFT JOIN users u ON pp.user_id = u.id
    `;
    
    const params = [];
    if (contestId !== null) {
      query += ' WHERE pp.contest_id = $1';
      params.push(contestId);
    }
    
    query += ' ORDER BY pp.draft_order';
    
    const { rows } = await pool.query(query, params);
    return rows;
  }

  // Get participant by ID
  static async findById(participantId) {
    const query = `
      SELECT 
        pp.*,
        u.email as user_email,
        u.name as user_name
      FROM pool_participants pp
      LEFT JOIN users u ON pp.user_id = u.id
      WHERE pp.participant_id = $1
    `;
    const { rows } = await pool.query(query, [participantId]);
    return rows[0];
  }

  // Get participant by user ID (optionally scoped to contest)
  static async findByUserId(userId, contestId = null) {
    let query = `
      SELECT 
        pp.*,
        u.email as user_email,
        u.name as user_name
      FROM pool_participants pp
      LEFT JOIN users u ON pp.user_id = u.id
      WHERE pp.user_id = $1
    `;
    const params = [userId];
    if (contestId !== null) {
      query += ' AND pp.contest_id = $2';
      params.push(contestId);
    }
    const { rows } = await pool.query(query, params);
    return rows[0];
  }

  // Get participant by draft order (scoped to contest)
  static async findByDraftOrder(draftOrder, contestId = null) {
    let query = `
      SELECT 
        pp.*,
        u.email as user_email,
        u.name as user_name
      FROM pool_participants pp
      LEFT JOIN users u ON pp.user_id = u.id
      WHERE pp.draft_order = $1
    `;
    const params = [draftOrder];
    if (contestId !== null) {
      query += ' AND pp.contest_id = $2';
      params.push(contestId);
    }
    const { rows } = await pool.query(query, params);
    return rows[0];
  }

  // Update participant
  static async update(participantId, data) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (data.participant_name !== undefined) {
      fields.push(`participant_name = $${paramCount}`);
      values.push(data.participant_name);
      paramCount++;
    }

    if (data.draft_order !== undefined) {
      fields.push(`draft_order = $${paramCount}`);
      values.push(data.draft_order);
      paramCount++;
    }

    if (data.user_id !== undefined) {
      fields.push(`user_id = $${paramCount}`);
      values.push(data.user_id);
      paramCount++;
    }

    if (data.active !== undefined) {
      fields.push(`active = $${paramCount}`);
      values.push(data.active);
      paramCount++;
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(participantId);
    const query = `
      UPDATE pool_participants 
      SET ${fields.join(', ')}
      WHERE participant_id = $${paramCount}
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);
    return rows[0];
  }

  // Delete participant
  static async delete(participantId) {
    const query = 'DELETE FROM pool_participants WHERE participant_id = $1 RETURNING *';
    const { rows } = await pool.query(query, [participantId]);
    return rows[0];
  }

  // Check if draft order is available for a contest
  static async isDraftOrderAvailable(draftOrder, contestId = null, excludeParticipantId = null) {
    let query = 'SELECT COUNT(*) FROM pool_participants WHERE draft_order = $1';
    const params = [draftOrder];
    let paramCount = 2;
    
    if (contestId !== null) {
      query += ` AND contest_id = $${paramCount}`;
      params.push(contestId);
      paramCount++;
    }
    
    if (excludeParticipantId) {
      query += ` AND participant_id != $${paramCount}`;
      params.push(excludeParticipantId);
    }
    
    const { rows } = await pool.query(query, params);
    return parseInt(rows[0].count) === 0;
  }

  // Get active participants count for a contest
  static async getActiveCount(contestId = null) {
    let query = 'SELECT COUNT(*) FROM pool_participants WHERE active = TRUE';
    const params = [];
    
    if (contestId !== null) {
      query += ' AND contest_id = $1';
      params.push(contestId);
    }
    
    const { rows } = await pool.query(query, params);
    return parseInt(rows[0].count);
  }

  // Get participant by user ID and contest ID
  static async findByUserAndContest(userId, contestId) {
    const query = `
      SELECT 
        pp.*,
        u.email as user_email,
        u.name as user_name
      FROM pool_participants pp
      LEFT JOIN users u ON pp.user_id = u.id
      WHERE pp.user_id = $1 AND pp.contest_id = $2
    `;
    const { rows } = await pool.query(query, [userId, contestId]);
    return rows[0];
  }

  // Remove user from contest
  static async removeFromContest(userId, contestId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: contests } = await client.query('SELECT status FROM contests WHERE contest_id = $1 FOR UPDATE', [contestId]);
      if (contests[0]?.status !== 'waiting') throw new Error('Cannot leave contest that has already started');
      const { rows } = await client.query('DELETE FROM pool_participants WHERE user_id = $1 AND contest_id = $2 RETURNING *', [userId, contestId]);
      await client.query(`UPDATE contests SET draft_order = NULL, current_participants =
        (SELECT COUNT(*) FROM pool_participants WHERE contest_id = $1 AND active) WHERE contest_id = $1`, [contestId]);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}

module.exports = PoolParticipant;

