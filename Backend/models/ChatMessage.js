const pool = require('../config/database');

class ChatMessage {
  /**
   * Get all chat messages with pagination
   * @param {number} limit - Number of messages to fetch
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>} Array of chat messages
   */
  static async getAllMessages(limit = 50, offset = 0) {
    const query = `
      SELECT 
        cm.id,
        cm.user_id,
        cm.username,
        cm.message,
        cm.type,
        cm.created_at,
        u.role as user_role
      FROM chat_messages cm
      LEFT JOIN users u ON cm.user_id = u.id
      ORDER BY cm.created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    const result = await pool.query(query, [limit, offset]);
    return result.rows;
  }

  /**
   * Get recent messages (for initial load)
   * @param {number} limit - Number of recent messages
   * @returns {Promise<Array>} Array of recent chat messages in chronological order
   */
  static async getRecentMessages(limit = 50) {
    const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    const query = `
      SELECT 
        cm.id,
        cm.user_id,
        cm.username,
        cm.message,
        cm.type,
        cm.created_at,
        u.role as user_role
      FROM chat_messages cm
      LEFT JOIN users u ON cm.user_id = u.id
      ORDER BY cm.created_at DESC
      LIMIT $1
    `;
    
    const result = await pool.query(query, [safeLimit]);
    // Reverse to get chronological order (oldest first)
    return result.rows.reverse();
  }

  /**
   * Get messages before a specific message ID (for pagination)
   * @param {number} beforeId - Message ID to get messages before
   * @param {number} limit - Number of messages to fetch
   * @returns {Promise<Array>} Array of chat messages in chronological order
   */
  static async getMessagesBefore(beforeId, limit = 50) {
    const query = `
      SELECT 
        cm.id,
        cm.user_id,
        cm.username,
        cm.message,
        cm.type,
        cm.created_at,
        u.role as user_role
      FROM chat_messages cm
      LEFT JOIN users u ON cm.user_id = u.id
      WHERE cm.id < $1
      ORDER BY cm.created_at DESC
      LIMIT $2
    `;
    
    const result = await pool.query(query, [beforeId, limit]);
    // Reverse to get chronological order (oldest first)
    return result.rows.reverse();
  }

  /**
   * Create a new chat message
   * @param {Object} messageData - Message data
   * @param {number} messageData.userId - ID of the user sending the message
   * @param {string} messageData.username - Username of the sender
   * @param {string} messageData.message - Message content
   * @param {string} messageData.type - Message type (user/admin/system)
   * @returns {Promise<Object>} Created message
   */
  static async createMessage({ userId, username, message, type = 'user' }) {
    const query = `
      INSERT INTO chat_messages (user_id, username, message, type)
      VALUES ($1, $2, $3, $4)
      RETURNING 
        id,
        user_id,
        username,
        message,
        type,
        created_at
    `;
    
    const result = await pool.query(query, [userId, username, message, type]);
    return result.rows[0];
  }

  /**
   * Get total message count
   * @returns {Promise<number>} Total number of messages
   */
  static async getMessageCount() {
    const query = 'SELECT COUNT(*) as count FROM chat_messages';
    const result = await pool.query(query);
    return parseInt(result.rows[0].count);
  }

  /**
   * Delete a message (admin only)
   * @param {number} messageId - ID of the message to delete
   * @returns {Promise<boolean>} Success status
   */
  static async deleteMessage(messageId) {
    const query = 'DELETE FROM chat_messages WHERE id = $1';
    const result = await pool.query(query, [messageId]);
    return result.rowCount > 0;
  }

  /**
   * Create a system message
   * @param {string} message - System message content
   * @returns {Promise<Object>} Created system message
   */
  static async createSystemMessage(message) {
    return this.createMessage({
      userId: null,
      username: 'System',
      message,
      type: 'system'
    });
  }

  /**
   * Create an admin message
   * @param {number} adminUserId - ID of admin user
   * @param {string} adminUsername - Username of admin
   * @param {string} message - Admin message content
   * @returns {Promise<Object>} Created admin message
   */
  static async createAdminMessage(adminUserId, adminUsername, message) {
    return this.createMessage({
      userId: adminUserId,
      username: adminUsername,
      message,
      type: 'admin'
    });
  }
}

module.exports = ChatMessage;

