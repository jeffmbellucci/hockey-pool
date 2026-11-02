const pool = require('../config/database');

const ALLOWED_KEYS = [
  'season_start_date',
  'season_year',
  'playoff_auto_update_enabled',
  'playoff_auto_update_interval_hours',
  'playoff_last_auto_update'
];

class Settings {
  /**
   * Get all settings
   * @returns {Object} Settings object with key-value pairs
   */
  static async getAll() {
    const query = `
      SELECT setting_key, setting_value, description
      FROM settings
      ORDER BY setting_key
    `;
    const { rows } = await pool.query(query);
    
    // Convert to key-value object
    const settings = {};
    rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    
    return settings;
  }
  
  /**
   * Get a specific setting by key
   * @param {string} key - Setting key
   * @returns {string|null} Setting value or null
   */
  static async get(key) {
    const query = 'SELECT setting_value FROM settings WHERE setting_key = $1';
    const { rows } = await pool.query(query, [key]);
    return rows[0]?.setting_value || null;
  }
  
  /**
   * Set a setting value
   * @param {string} key - Setting key
   * @param {string} value - Setting value
   * @returns {Object} Updated setting
   */
  static async set(key, value) {
    if (!ALLOWED_KEYS.includes(key)) {
      throw new Error(`Invalid setting key: ${key}`);
    }
    const query = `
      INSERT INTO settings (setting_key, setting_value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (setting_key) 
      DO UPDATE SET 
        setting_value = EXCLUDED.setting_value,
        updated_at = NOW()
      RETURNING setting_key, setting_value
    `;
    
    const { rows } = await pool.query(query, [key, value]);
    return rows[0];
  }
  
  /**
   * Update multiple settings at once
   * @param {Object} settings - Object with setting key-value pairs
   * @returns {Object} Updated settings
   */
  static async updateMultiple(settings) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const updatedSettings = {};
      const skippedKeys = [];
      
      for (const [key, value] of Object.entries(settings)) {
        if (!ALLOWED_KEYS.includes(key)) {
          skippedKeys.push(key);
          continue;
        }
        const query = `
          INSERT INTO settings (setting_key, setting_value, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (setting_key) 
          DO UPDATE SET 
            setting_value = EXCLUDED.setting_value,
            updated_at = NOW()
          RETURNING setting_key, setting_value
        `;
        
        const { rows } = await client.query(query, [key, value]);
        if (rows[0]) {
          updatedSettings[rows[0].setting_key] = rows[0].setting_value;
        }
      }
      
      await client.query('COMMIT');
      return { updated: updatedSettings, skippedKeys };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Delete a setting
   * @param {string} key - Setting key
   * @returns {boolean} True if deleted, false otherwise
   */
  static async delete(key) {
    const query = 'DELETE FROM settings WHERE setting_key = $1 RETURNING setting_key';
    const { rows } = await pool.query(query, [key]);
    return rows.length > 0;
  }
}

module.exports = Settings;


