const mailjet = require('node-mailjet');
const pool = require('../config/database');

/**
 * Email Service
 * Handles all email sending operations using Mailjet
 */
class EmailService {
  constructor() {
    this.mailjetClient = null;
    this.settings = null;
  }

  /**
   * Initialize Mailjet client with settings from database
   */
  async initialize() {
    this.mailjetClient = null;
    this.settings = null;
    if (process.env.EMAIL_ENABLED === 'false') return false;
    try {
      const settingsQuery = `
        SELECT * FROM email_settings 
        WHERE id = 1
      `;
      const result = await pool.query(settingsQuery);
      
      if (result.rows.length === 0) {
        console.log('No email settings found. Email service disabled.');
        return false;
      }

      this.settings = result.rows[0];

      if (!this.settings.enabled) {
        console.log('Email service is disabled in settings.');
        return false;
      }

      if (!this.settings.mailjet_api_key || !this.settings.mailjet_api_secret) {
        console.log('Mailjet credentials not configured.');
        return false;
      }

      this.mailjetClient = mailjet.apiConnect(
        this.settings.mailjet_api_key,
        this.settings.mailjet_api_secret
      );

      console.log('Email service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize email service:', error);
      return false;
    }
  }

  /**
   * Check if email service is ready
   */
  isReady() {
    return process.env.EMAIL_ENABLED !== 'false' && this.mailjetClient !== null && this.settings?.enabled === true;
  }

  async checkConnection(settings) {
    if (!settings) settings = (await pool.query('SELECT * FROM email_settings WHERE id = 1')).rows[0];
    if (!settings?.mailjet_api_key || !settings?.mailjet_api_secret) throw new Error('Save your Mailjet API key and secret first.');
    if (!settings.from_email || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(settings.from_email)) throw new Error('Save a valid From Email address first.');
    try {
      const client = mailjet.apiConnect(settings.mailjet_api_key, settings.mailjet_api_secret, { options: { timeout: 15000 } });
      // Authenticate separately so a missing sender cannot be mistaken for a bad key.
      await client.get('sender').request({ Limit: 1 });
      const domain = settings.from_email.split('@')[1].toLowerCase();
      const senders = await Promise.all([settings.from_email.toLowerCase(), `*@${domain}`].map(async address => {
        try { return (await client.get('sender').id(address).request()).body.Data || []; }
        catch (error) { if (error.statusCode === 404) return []; throw error; }
      }));
      return { connected: true, sender_email: settings.from_email,
        sender_verified: senders.flat().some(sender => sender.Status === 'Active'),
        checked_at: new Date().toISOString() };
    } catch {
      throw new Error('Could not verify the Mailjet connection. Check the API key and secret from the same Mailjet account, then try again.');
    }
  }

  async sendMessage(message, client = this.mailjetClient, sandbox = false) {
    let response;
    try {
      response = await client.post('send', { version: 'v3.1' }).request({
        SandboxMode: sandbox,
        Messages: [message],
      });
    } catch {
      // Provider errors may contain the authenticated request; do not expose it in logs or responses.
      throw new Error('Mailjet request failed. Check your API keys, verified sender, and Mailjet account status.');
    }
    if (response.body?.Messages?.[0]?.Status !== 'success') {
      throw new Error('Mailjet rejected the email. Check your API keys and verified sender in Mailjet.');
    }
  }

  /**
   * Send a pick reminder email
   */
  async sendPickReminder(userEmail, userName, contestName, weekNumber, lockTime, reminderType) {
    if (!this.isReady()) {
      console.log('Email service not ready, skipping email');
      return false;
    }

    try {
      const subject = reminderType === 'night_before' 
        ? `Reminder: Make your ${contestName} pick for Week ${weekNumber}`
        : `URGENT: ${contestName} Week ${weekNumber} locks in 2 hours!`;

      const lockTimeFormatted = new Date(lockTime).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
            .warning { background-color: ${reminderType === 'night_before' ? '#fef3c7' : '#fee2e2'}; 
                       padding: 15px; border-left: 4px solid ${reminderType === 'night_before' ? '#f59e0b' : '#ef4444'}; 
                       margin: 20px 0; }
            .button { display: inline-block; background-color: #1e40af; color: white; padding: 12px 30px; 
                     text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🏒 Hockey Pool</h1>
            </div>
            <div class="content">
              <h2>Hi ${userName},</h2>
              
              <div class="warning">
                <strong>${reminderType === 'night_before' ? '⏰ Reminder' : '🚨 URGENT'}</strong>: 
                You haven't made your pick yet for Week ${weekNumber} of ${contestName}!
              </div>
              
              <p><strong>Lock Time:</strong> ${lockTimeFormatted}</p>
              
              <p>${reminderType === 'night_before' 
                ? "Don't forget to make your pick before the first game starts!"
                : "Time is running out! You only have 2 hours left to make your pick before the games begin."
              }</p>
              
              <div style="text-align: center;">
                <a href="${this.settings.app_url}/survivor" class="button">
                  Make Your Pick Now
                </a>
              </div>
              
              <p><strong>Important:</strong> If you don't make a pick before the lock time, you may be eliminated from the contest!</p>
              
              <p>Good luck!</p>
            </div>
            <div class="footer">
              <p>Hockey Pool - Survivor Contest</p>
              <p>To manage your notification preferences, visit your account settings.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const textContent = `
Hi ${userName},

${reminderType === 'night_before' ? 'REMINDER' : 'URGENT'}: You haven't made your pick yet for Week ${weekNumber} of ${contestName}!

Lock Time: ${lockTimeFormatted}

${reminderType === 'night_before' 
  ? "Don't forget to make your pick before the first game starts!"
  : "Time is running out! You only have 2 hours left to make your pick before the games begin."
}

Visit ${this.settings.app_url}/survivor to make your pick now.

Important: If you don't make a pick before the lock time, you may be eliminated from the contest!

Good luck!

---
Hockey Pool - Survivor Contest
To manage your notification preferences, visit your account settings.
      `;

      await this.sendMessage({
              From: {
                Email: this.settings.from_email,
                Name: this.settings.from_name
              },
              To: [
                {
                  Email: userEmail,
                  Name: userName
                }
              ],
              Subject: subject,
              TextPart: textContent,
              HTMLPart: htmlContent
            });

      console.log(`Pick reminder email sent to ${userEmail}`);
      return true;
    } catch (error) {
      console.error(`Failed to send pick reminder to ${userEmail}:`, error);
      throw error;
    }
  }

  /**
   * Send elimination notification
   */
  async sendEliminationEmail(userEmail, userName, contestName, weekNumber, teamName) {
    if (!this.isReady()) {
      console.log('Email service not ready, skipping email');
      return false;
    }

    try {
      const subject = `You've been eliminated from ${contestName}`;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
            .elimination-box { background-color: #fee2e2; padding: 20px; border-left: 4px solid #dc2626; margin: 20px 0; }
            .button { display: inline-block; background-color: #1e40af; color: white; padding: 12px 30px; 
                     text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🏒 Hockey Pool</h1>
            </div>
            <div class="content">
              <h2>Hi ${userName},</h2>
              
              <div class="elimination-box">
                <strong>❌ Elimination Notice</strong><br>
                Unfortunately, you've been eliminated from ${contestName}.
              </div>
              
              <p><strong>Week ${weekNumber}</strong> - Your pick: ${teamName}</p>
              
              <p>Thank you for participating! We hope you enjoyed the competition.</p>
              
              <div style="text-align: center;">
                <a href="${this.settings.app_url}/survivor" class="button">
                  View Final Standings
                </a>
              </div>
              
              <p>Better luck next season!</p>
            </div>
            <div class="footer">
              <p>Hockey Pool - Survivor Contest</p>
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendMessage({
              From: {
                Email: this.settings.from_email,
                Name: this.settings.from_name
              },
              To: [
                {
                  Email: userEmail,
                  Name: userName
                }
              ],
              Subject: subject,
              HTMLPart: htmlContent
            });

      console.log(`Elimination email sent to ${userEmail}`);
      return true;
    } catch (error) {
      console.error(`Failed to send elimination email to ${userEmail}:`, error);
      throw error;
    }
  }

  /**
   * Send test email
   */
  async sendTestEmail(toEmail, toName, sandbox = false) {
    if (!sandbox && process.env.EMAIL_ENABLED === 'false') throw new Error('Email service not ready: delivery is disabled on this server.');
    // Explicit admin tests do not enable the automated notification client.
    const settings = (await pool.query('SELECT * FROM email_settings WHERE id = 1')).rows[0];
    if (!settings?.mailjet_api_key || !settings?.mailjet_api_secret) throw new Error('Save your Mailjet API key and secret first.');
    const client = mailjet.apiConnect(settings.mailjet_api_key, settings.mailjet_api_secret);

    try {
      await this.sendMessage({
              From: {
                Email: settings.from_email,
                Name: settings.from_name
              },
              To: [
                {
                  Email: toEmail,
                  Name: toName
                }
              ],
              Subject: 'Test Email from Hockey Pool',
              TextPart: 'This is a test email from Hockey Pool notification system.',
              HTMLPart: `
                <h3>Test Email</h3>
                <p>This is a test email from Hockey Pool notification system.</p>
                <p>If you received this, your email configuration is working correctly!</p>
              `
            }, client, sandbox);

      return true;
    } catch (error) {
      console.error('Failed to send test email:', error);
      throw error;
    }
  }
}

// Export singleton instance
const emailService = new EmailService();
module.exports = emailService;

