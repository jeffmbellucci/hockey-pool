const bcrypt = require('bcrypt');
const pool = require('../config/database');

class User {
  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Object} User object
   */
  static async create(userData) {
    // Hash the password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(userData.password, salt);
    
    // Insert user into database
    const query = `
      INSERT INTO users (email, password, name, last_name, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, name, last_name, role, active, created_at, updated_at
    `;
    
    const values = [
      userData.email.toLowerCase(),
      hashedPassword,
      userData.name,
      userData.lastName,
      userData.role || 'player'
    ];
    
    const { rows } = await pool.query(query, values);
    return rows[0];
  }
  
  /**
   * Find user by ID
   * @param {string} id - User ID
   * @returns {Object|null} User object or null
   */
  static async findById(id) {
    const query = 'SELECT * FROM users WHERE id = $1';
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
  }
  
  /**
   * Find user by email
   * @param {string} email - User email
   * @returns {Object|null} User object or null
   */
  static async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const { rows } = await pool.query(query, [email.toLowerCase()]);
    return rows[0] || null;
  }
  
  /**
   * Find user by refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Object|null} User object or null
   */
  static async findByRefreshToken(refreshToken) {
    const query = `
      SELECT * FROM users 
      WHERE refresh_token = $1 
      AND refresh_token_exp > NOW()
      AND active = TRUE
    `;
    const { rows } = await pool.query(query, [refreshToken]);
    return rows[0] || null;
  }
  
  /**
   * Update user by ID
   * @param {string} id - User ID
   * @param {Object} updateData - Data to update
   * @returns {Object} Updated user
   */
  static async update(id, updateData) {
    // Whitelist allowed fields to prevent privilege escalation
    const ALLOWED_FIELDS = ['name', 'last_name', 'email', 'avatar_url'];
    return this._doUpdate(id, updateData, ALLOWED_FIELDS);
  }

  /**
   * Admin-level update — allows role and active in addition to profile fields
   */
  static async adminUpdate(id, updateData) {
    const ALLOWED_FIELDS = ['name', 'last_name', 'email', 'avatar_url', 'role', 'active'];
    return this._doUpdate(id, updateData, ALLOWED_FIELDS);
  }

  /**
   * Internal helper for field-whitelisted updates
   */
  static async _doUpdate(id, updateData, allowedFields) {
    const filtered = Object.fromEntries(
      Object.entries(updateData).filter(([key]) => allowedFields.includes(key))
    );

    // Build the SET part of the query dynamically
    const keys = Object.keys(filtered);
    const values = Object.values(filtered);
    
    // No fields to update
    if (keys.length === 0) {
      return await this.findById(id);
    }
    
    let setClause = '';
    const queryValues = [];
    
    keys.forEach((key, index) => {
      // Convert camelCase to snake_case for DB column names
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      queryValues.push(values[index]);
      
      if (index > 0) {
        setClause += ', ';
      }
      
      setClause += `${dbKey} = $${index + 1}`;
    });
    
    // Add updated_at timestamp
    setClause += `, updated_at = NOW()`;
    
    // Add the id to the values array
    queryValues.push(id);
    
    const query = `
      UPDATE users 
      SET ${setClause} 
      WHERE id = $${queryValues.length}
      RETURNING id, email, name, role, active, created_at, updated_at
    `;
    
    const { rows } = await pool.query(query, queryValues);
    return rows[0] || null;
  }

  /**
   * Update user password (admin-only operation)
   * @param {string} id - User ID
   * @param {string} hashedPassword - Already-hashed password
   * @returns {Object} Updated user
   */
  static async updatePassword(id, hashedPassword) {
    const query = `
      UPDATE users
      SET password = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, email, name, role, active, created_at, updated_at
    `;
    const { rows } = await pool.query(query, [hashedPassword, id]);
    return rows[0] || null;
  }
  
  /**
   * Compare password
   * @param {string} password - Password to compare
   * @param {string} hashedPassword - Hashed password from DB
   * @returns {boolean} True if matching, false otherwise
   */
  static async comparePassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }
  
  /**
   * Set refresh token for user
   * @param {string} id - User ID
   * @param {string} refreshToken - Refresh token
   * @param {Date} expiresAt - Expiration date
   * @returns {Object} Updated user
   */
  static async setRefreshToken(id, refreshToken, expiresAt) {
    const query = `
      UPDATE users 
      SET refresh_token = $1, refresh_token_exp = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING id
    `;
    
    const values = [refreshToken, expiresAt, id];
    await pool.query(query, values);
  }
  
  /**
   * Clear refresh token for user
   * @param {string} id - User ID
   */
  static async clearRefreshToken(id) {
    const query = `
      UPDATE users 
      SET refresh_token = NULL, refresh_token_exp = NULL, updated_at = NOW()
      WHERE id = $1
    `;
    
    await pool.query(query, [id]);
  }
  
  /**
   * Get all users
   * @returns {Array} Array of user objects
   */
  static async findAll() {
    const query = `
      SELECT id, email, name, last_name, role, active, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query);
    return rows;
  }
  
  /**
   * Delete user by ID
   * @param {string} id - User ID
   * @returns {boolean} True if deleted, false otherwise
   */
  static async delete(id) {
    const query = 'DELETE FROM users WHERE id = $1 RETURNING id';
    const { rows } = await pool.query(query, [id]);
    return rows.length > 0;
  }
}

module.exports = User; 