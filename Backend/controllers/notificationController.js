const pool = require('../config/database');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');

/**
 * Check if a value is a masked placeholder (exactly '••••' + 4 chars = 8 chars total).
 * Prevents bypass where attacker sends '••••realkey'.
 */
function isMaskedValue(value) {
  return typeof value === 'string' && (/^••••.{4}$/.test(value) || value === '***********');
}

function publicSettings(row) {
  const settings = { ...row, delivery_disabled: process.env.EMAIL_ENABLED === 'false',
    scheduler_disabled: process.env.SCHEDULER_ENABLED === 'false',
    credentials_configured: Boolean(row.mailjet_api_key && row.mailjet_api_secret) };
  for (const field of ['mailjet_api_key', 'mailjet_api_secret']) {
    if (settings[field]) settings[field] = '••••' + settings[field].slice(-4);
  }
  return settings;
}

const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);

/**
 * Get email settings (Admin only)
 */
exports.getEmailSettings = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM email_settings WHERE id = 1');
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Email settings not found' 
      });
    }

    const settings = publicSettings(result.rows[0]);

    res.json({ 
      success: true, 
      settings 
    });
  } catch (error) {
    console.error('Error fetching email settings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch email settings' 
    });
  }
};

/**
 * Update email settings (Admin only)
 */
exports.updateEmailSettings = async (req, res) => {
  try {
    // Empty credential inputs mean keep the saved value, including legacy null responses.
    req.body = { ...req.body };
    for (const field of ['mailjet_api_key', 'mailjet_api_secret']) {
      if (typeof req.body[field] === 'string') req.body[field] = req.body[field].trim();
      if (req.body[field] == null || req.body[field] === '' || isMaskedValue(req.body[field])) delete req.body[field];
    }
    const {
      enabled,
      mailjet_api_key,
      mailjet_api_secret,
      from_email,
      from_name,
      app_url,
      reminder_night_before_enabled,
      reminder_night_before_time,
      reminder_two_hours_enabled
    } = req.body;

    for (const field of ['enabled', 'reminder_night_before_enabled', 'reminder_two_hours_enabled']) {
      if (req.body[field] !== undefined && typeof req.body[field] !== 'boolean') {
        return res.status(400).json({ success: false, message: `${field} must be true or false` });
      }
    }
    for (const field of ['mailjet_api_key', 'mailjet_api_secret', 'from_name', 'app_url']) {
      if (req.body[field] !== undefined && (typeof req.body[field] !== 'string' || req.body[field].length > 255)) {
        return res.status(400).json({ success: false, message: `Invalid ${field}` });
      }
    }
    if (from_email !== undefined && !validEmail(from_email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid sender email address' });
    }
    if (app_url !== undefined) {
      try {
        const url = new URL(app_url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[<>"']/.test(app_url)) throw new Error();
      } catch {
        return res.status(400).json({ success: false, message: 'Application URL must be an http or https address' });
      }
    }
    if (reminder_night_before_time !== undefined && (typeof reminder_night_before_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(reminder_night_before_time))) {
      return res.status(400).json({ success: false, message: 'Enter a valid reminder time' });
    }

    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (enabled !== undefined) {
      updateFields.push(`enabled = $${paramCount++}`);
      values.push(enabled);
    }

    if (mailjet_api_key !== undefined && !isMaskedValue(mailjet_api_key)) {
      updateFields.push(`mailjet_api_key = $${paramCount++}`);
      values.push(mailjet_api_key);
    }

    // Only update secret if provided and not masked
    if (mailjet_api_secret && !isMaskedValue(mailjet_api_secret)) {
      updateFields.push(`mailjet_api_secret = $${paramCount++}`);
      values.push(mailjet_api_secret);
    }

    if (from_email !== undefined) {
      updateFields.push(`from_email = $${paramCount++}`);
      values.push(from_email);
    }

    if (from_name !== undefined) {
      updateFields.push(`from_name = $${paramCount++}`);
      values.push(from_name);
    }

    if (app_url !== undefined) {
      updateFields.push(`app_url = $${paramCount++}`);
      values.push(app_url);
    }

    if (reminder_night_before_enabled !== undefined) {
      updateFields.push(`reminder_night_before_enabled = $${paramCount++}`);
      values.push(reminder_night_before_enabled);
    }

    if (reminder_night_before_time !== undefined) {
      updateFields.push(`reminder_night_before_time = $${paramCount++}`);
      values.push(reminder_night_before_time);
    }

    if (reminder_two_hours_enabled !== undefined) {
      updateFields.push(`reminder_two_hours_enabled = $${paramCount++}`);
      values.push(reminder_two_hours_enabled);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No fields to update' 
      });
    }

    if (enabled === true) {
      if (process.env.EMAIL_ENABLED === 'false' || process.env.SCHEDULER_ENABLED === 'false') {
        return res.status(400).json({ success: false, message: 'Automated emails are blocked on this server. Ask the site administrator to enable email delivery and the scheduler in Coolify.' });
      }
      const current = await pool.query('SELECT * FROM email_settings WHERE id = 1');
      let connection;
      try { connection = await emailService.checkConnection({ ...current.rows[0], ...req.body }); }
      catch (error) { return res.status(400).json({ success: false, message: error.message }); }
      if (!connection.sender_verified) return res.status(400).json({ success: false, message: 'Verify the From Email address or its domain in Mailjet before enabling automated emails.' });
    }

    const query = `
      UPDATE email_settings 
      SET ${updateFields.join(', ')}
      WHERE id = 1
      RETURNING *
    `;

    const result = await pool.query(query, values);

    // Reinitialize email service with new settings
    await emailService.initialize();

    // Reschedule notifications if reminder settings changed
    if (enabled === true || reminder_night_before_enabled !== undefined ||
        reminder_night_before_time !== undefined || 
        reminder_two_hours_enabled !== undefined) {
      // Run in background to not delay response
      notificationService.rescheduleAllFutureNotifications().catch(err => {
        console.error('Error rescheduling notifications:', err);
      });
    }

    const settings = publicSettings(result.rows[0]);

    res.json({ 
      success: true, 
      message: 'Email settings updated successfully',
      settings 
    });
  } catch (error) {
    console.error('Error updating email settings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update email settings' 
    });
  }
};

exports.checkConnection = async (req, res) => {
  try {
    res.json({ success: true, connection: await emailService.checkConnection() });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Send test email (Admin only)
 */
exports.sendTestEmail = async (req, res) => {
  try {
    const { email, name, sandbox = false } = req.body;

    if (!validEmail(email) || typeof sandbox !== 'boolean' || (name !== undefined && (typeof name !== 'string' || name.length > 255))) {
      return res.status(400).json({ 
        success: false, 
        message: 'Enter a valid recipient email address and test options'
      });
    }

    if (!sandbox && process.env.EMAIL_ENABLED === 'false') {
      return res.status(400).json({ 
        success: false, 
        message: 'Email delivery is disabled on this server. Configuration checks still work.'
      });
    }

    await emailService.sendTestEmail(email, name || 'Test User', sandbox);

    res.json({ 
      success: true, 
      message: sandbox ? 'Mailjet accepted the configuration check. No email was sent.' : 'Mailjet accepted the test email. Check your inbox and spam folder.'
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to send test email' 
    });
  }
};

/**
 * Get user notification preferences
 */
exports.getUserPreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contestId } = req.params;

    let query, values;

    if (contestId) {
      // Get preferences for specific contest
      query = `
        SELECT * FROM user_notification_preferences
        WHERE user_id = $1 AND contest_id = $2
      `;
      values = [userId, contestId];
    } else {
      // Get all preferences for user
      query = `
        SELECT 
          unp.*,
          c.contest_name,
          c.contest_type
        FROM user_notification_preferences unp
        JOIN contests c ON unp.contest_id = c.contest_id
        WHERE unp.user_id = $1
        ORDER BY c.created_at DESC
      `;
      values = [userId];
    }

    const result = await pool.query(query, values);

    res.json({ 
      success: true, 
      preferences: contestId ? result.rows[0] || null : result.rows
    });
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch notification preferences' 
    });
  }
};

/**
 * Update user notification preferences
 */
exports.updateUserPreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contestId } = req.params;
    const {
      email_reminders,
      email_eliminations,
      email_results,
      email_advancement
    } = req.body;

    // Verify user is participant in contest
    const participantCheck = await pool.query(`
      SELECT id FROM survivor_participants
      WHERE user_id = $1 AND contest_id = $2
    `, [userId, contestId]);

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'You are not a participant in this contest' 
      });
    }

    const query = `
      INSERT INTO user_notification_preferences (
        user_id, contest_id, email_reminders, 
        email_eliminations, email_results, email_advancement
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, contest_id) 
      DO UPDATE SET
        email_reminders = EXCLUDED.email_reminders,
        email_eliminations = EXCLUDED.email_eliminations,
        email_results = EXCLUDED.email_results,
        email_advancement = EXCLUDED.email_advancement
      RETURNING *
    `;

    const result = await pool.query(query, [
      userId,
      contestId,
      email_reminders !== undefined ? email_reminders : true,
      email_eliminations !== undefined ? email_eliminations : true,
      email_results !== undefined ? email_results : true,
      email_advancement !== undefined ? email_advancement : true
    ]);

    res.json({ 
      success: true, 
      message: 'Notification preferences updated successfully',
      preferences: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update notification preferences' 
    });
  }
};

/**
 * Get notification history for a contest (Admin only)
 */
exports.getNotificationHistory = async (req, res) => {
  try {
    const { contestId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const history = await notificationService.getNotificationHistory(contestId, limit);

    res.json({ 
      success: true, 
      notifications: history 
    });
  } catch (error) {
    console.error('Error fetching notification history:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch notification history' 
    });
  }
};

/**
 * Manually trigger notification processing (Admin only)
 */
exports.processNotifications = async (req, res) => {
  try {
    // Run in background
    notificationService.processPendingNotifications().catch(err => {
      console.error('Error processing notifications:', err);
    });

    res.json({ 
      success: true, 
      message: 'Notification processing triggered' 
    });
  } catch (error) {
    console.error('Error triggering notification processing:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to trigger notification processing' 
    });
  }
};

