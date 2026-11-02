const pool = require('../config/database');
const emailService = require('./emailService');

/**
 * Notification Service
 * Handles scheduling and sending of survivor contest notifications
 */
class NotificationService {
  /**
   * Schedule notifications for a specific week
   * Called when a week is created or updated
   */
  async scheduleWeekNotifications(contestId, weekNumber, lockTime) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if email settings are configured
      const settingsResult = await client.query('SELECT * FROM email_settings WHERE id = 1');
      if (settingsResult.rows.length === 0 || !settingsResult.rows[0].enabled) {
        console.log('Email notifications disabled, skipping scheduling');
        await client.query('COMMIT');
        return;
      }

      const settings = settingsResult.rows[0];
      const lockDateTime = new Date(lockTime);

      // Cancel any existing pending notifications for this week
      await client.query(`
        UPDATE survivor_notifications 
        SET status = 'cancelled'
        WHERE contest_id = $1 
          AND week_number = $2 
          AND status = 'pending'
      `, [contestId, weekNumber]);

      // Schedule night before reminder (if enabled)
      if (settings.reminder_night_before_enabled) {
        const nightBeforeTime = new Date(lockDateTime);
        nightBeforeTime.setDate(nightBeforeTime.getDate() - 1);
        
        // Set to configured time (default 8 PM)
        const [hours, minutes] = settings.reminder_night_before_time.split(':');
        nightBeforeTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        // Only schedule if it's in the future
        if (nightBeforeTime > new Date()) {
          await client.query(`
            INSERT INTO survivor_notifications (
              contest_id, week_number, notification_type, 
              scheduled_time, status
            )
            VALUES ($1, $2, 'night_before', $3, 'pending')
          `, [contestId, weekNumber, nightBeforeTime]);
          
          console.log(`Scheduled night_before notification for contest ${contestId}, week ${weekNumber} at ${nightBeforeTime}`);
        }
      }

      // Schedule 2 hours before reminder (if enabled)
      if (settings.reminder_two_hours_enabled) {
        const twoHoursBefore = new Date(lockDateTime);
        twoHoursBefore.setHours(twoHoursBefore.getHours() - 2);

        // Only schedule if it's in the future
        if (twoHoursBefore > new Date()) {
          await client.query(`
            INSERT INTO survivor_notifications (
              contest_id, week_number, notification_type, 
              scheduled_time, status
            )
            VALUES ($1, $2, 'two_hours_before', $3, 'pending')
          `, [contestId, weekNumber, twoHoursBefore]);
          
          console.log(`Scheduled two_hours_before notification for contest ${contestId}, week ${weekNumber} at ${twoHoursBefore}`);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error scheduling week notifications:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check and send pending notifications
   * Called by scheduled job every few minutes
   */
  async processPendingNotifications() {
    try {
      // Initialize email service if not already done
      if (!emailService.isReady()) {
        await emailService.initialize();
        if (!emailService.isReady()) {
          console.log('Email service not ready, skipping notification processing');
          return;
        }
      }

      // Find all pending notifications that should be sent now,
      // including failed ones eligible for retry (max 3 attempts, exponential backoff)
      const notificationsQuery = `
        SELECT 
          sn.*,
          c.contest_name,
          c.season_year
        FROM survivor_notifications sn
        JOIN contests c ON sn.contest_id = c.contest_id
        JOIN survivor_weeks sw ON sw.contest_id = sn.contest_id AND sw.week_number = sn.week_number
        WHERE (
          (sn.status = 'pending' AND sn.scheduled_time <= CURRENT_TIMESTAMP)
          OR (sn.status = 'failed' AND COALESCE(sn.retry_count, 0) < 3 
              AND sn.sent_at + (INTERVAL '5 minutes' * POWER(2, COALESCE(sn.retry_count, 0))) <= CURRENT_TIMESTAMP)
        )
          AND (sn.notification_type = 'night_before' OR sn.notification_type = 'two_hours_before')
          AND c.status = 'in_progress' AND c.phase = 'regular_season'
          AND sw.lock_time > CURRENT_TIMESTAMP
        ORDER BY sn.scheduled_time ASC
      `;

      const result = await pool.query(notificationsQuery);
      const notifications = result.rows;

      console.log(`Found ${notifications.length} pending notifications to process`);

      for (const notification of notifications) {
        await this.sendPickReminders(notification);
      }
    } catch (error) {
      console.error('Error processing pending notifications:', error);
    }
  }

  /**
   * Send pick reminders to users who haven't made a pick yet
   */
  async sendPickReminders(notification) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Lock the row until delivery finishes; "processing" is not a valid persisted status.
      const claimed = await client.query('SELECT status FROM survivor_notifications WHERE id = $1 FOR UPDATE', [notification.id]);
      if (!['pending', 'failed'].includes(claimed.rows[0]?.status)) {
        await client.query('COMMIT');
        return;
      }

      // Find all participants who haven't made a pick for this week
      // and have email reminders enabled
      const usersQuery = `
        SELECT 
          u.id as user_id,
          u.email,
          sp.participant_name AS username,
          sp.id as participant_id
        FROM survivor_participants sp
        JOIN users u ON sp.user_id = u.id
        LEFT JOIN user_notification_preferences unp 
          ON u.id = unp.user_id AND sp.contest_id = unp.contest_id
        LEFT JOIN survivor_picks spick 
          ON sp.id = spick.participant_id 
          AND spick.week_number = $2
        WHERE sp.contest_id = $1
          AND sp.is_eliminated = FALSE
          AND spick.id IS NULL
          AND (unp.email_reminders IS NULL OR unp.email_reminders = TRUE)
      `;

      const usersResult = await client.query(usersQuery, [
        notification.contest_id,
        notification.week_number
      ]);

      const users = usersResult.rows;
      console.log(`Found ${users.length} users without picks for contest ${notification.contest_id}, week ${notification.week_number}`);

      let successCount = 0;
      let failCount = 0;
      const errors = [];

      // Get week info for lock time
      const weekQuery = `
        SELECT lock_time FROM survivor_weeks
        WHERE contest_id = $1 AND week_number = $2
      `;
      const weekResult = await client.query(weekQuery, [notification.contest_id, notification.week_number]);
      const lockTime = weekResult.rows[0]?.lock_time;

      // Send emails to each user
      for (const user of users) {
        try {
          await emailService.sendPickReminder(
            user.email,
            user.username,
            notification.contest_name,
            notification.week_number,
            lockTime,
            notification.notification_type
          );
          successCount++;
        } catch (error) {
          console.error(`Failed to send reminder to ${user.email}:`, error.message);
          failCount++;
          errors.push(`${user.email}: ${error.message}`);
        }
      }

      // Update notification status
      const finalStatus = failCount === 0 ? 'sent' : (successCount === 0 ? 'failed' : 'sent');
      const errorMessage = errors.length > 0 ? errors.join('; ') : null;

      await client.query(`
        UPDATE survivor_notifications 
        SET status = $1::varchar,
            sent_at = CURRENT_TIMESTAMP,
            recipients_count = $2,
            error_message = $3,
            retry_count = COALESCE(retry_count, 0) + CASE WHEN $1 = 'failed' THEN 1 ELSE 0 END
        WHERE id = $4
      `, [finalStatus, successCount, errorMessage, notification.id]);

      await client.query('COMMIT');

      console.log(`Notification ${notification.id} processed: ${successCount} sent, ${failCount} failed`);
    } catch (error) {
      await client.query('ROLLBACK');
      
      // Mark notification as failed
      try {
        await pool.query(`
          UPDATE survivor_notifications 
          SET status = 'failed',
              error_message = $1
          WHERE id = $2
        `, [error.message, notification.id]);
      } catch (updateError) {
        console.error('Failed to update notification status:', updateError);
      }

      console.error('Error sending pick reminders:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get notification history for a contest
   */
  async getNotificationHistory(contestId, limit = 50) {
    const query = `
      SELECT 
        sn.*,
        c.contest_name
      FROM survivor_notifications sn
      JOIN contests c ON sn.contest_id = c.contest_id
      WHERE sn.contest_id = $1
      ORDER BY sn.scheduled_time DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [contestId, limit]);
    return result.rows;
  }

  /**
   * Reschedule all future notifications for active contests
   * Useful when email settings are changed
   */
  async rescheduleAllFutureNotifications() {
    try {
      // Get all active contests
      const contestsQuery = `
        SELECT DISTINCT 
          sw.contest_id,
          sw.week_number,
          sw.lock_time
        FROM survivor_weeks sw
        JOIN contests c ON sw.contest_id = c.contest_id
        WHERE c.status IN ('in_progress', 'waiting')
          AND sw.lock_time > NOW()
        ORDER BY sw.contest_id, sw.week_number
      `;

      const result = await pool.query(contestsQuery);
      const weeks = result.rows;

      console.log(`Rescheduling notifications for ${weeks.length} future weeks`);

      for (const week of weeks) {
        await this.scheduleWeekNotifications(
          week.contest_id,
          week.week_number,
          week.lock_time
        );
      }

      console.log('Finished rescheduling all future notifications');
    } catch (error) {
      console.error('Error rescheduling notifications:', error);
      throw error;
    }
  }
}

// Export singleton instance
const notificationService = new NotificationService();
module.exports = notificationService;

