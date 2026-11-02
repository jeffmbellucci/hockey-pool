-- Migration 40: Create email_settings table
-- Stores Mailjet configuration and email service settings

CREATE TABLE IF NOT EXISTS email_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    enabled BOOLEAN DEFAULT FALSE,
    mailjet_api_key VARCHAR(255),
    mailjet_api_secret VARCHAR(255),
    from_email VARCHAR(255) NOT NULL DEFAULT 'noreply@hockeyPoolhub.com',
    from_name VARCHAR(255) NOT NULL DEFAULT 'Hockey Pool',
    app_url VARCHAR(255) NOT NULL DEFAULT 'http://localhost:5173',
    reminder_night_before_enabled BOOLEAN DEFAULT TRUE,
    reminder_night_before_time TIME DEFAULT '20:00:00',
    reminder_two_hours_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT single_email_settings CHECK (id = 1)
);

-- Insert default settings
INSERT INTO email_settings (id, enabled, from_email, from_name, app_url)
VALUES (1, FALSE, 'noreply@hockeyPoolhub.com', 'Hockey Pool', 'http://localhost:5173')
ON CONFLICT (id) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_settings_enabled ON email_settings(enabled);

-- Add comments
COMMENT ON TABLE email_settings IS 'Email service configuration and Mailjet settings';
COMMENT ON COLUMN email_settings.enabled IS 'Master switch to enable/disable all email notifications';
COMMENT ON COLUMN email_settings.mailjet_api_key IS 'Mailjet API public key';
COMMENT ON COLUMN email_settings.mailjet_api_secret IS 'Mailjet API secret key';
COMMENT ON COLUMN email_settings.from_email IS 'Sender email address for all notifications';
COMMENT ON COLUMN email_settings.from_name IS 'Sender name for all notifications';
COMMENT ON COLUMN email_settings.app_url IS 'Base URL of the application for links in emails';
COMMENT ON COLUMN email_settings.reminder_night_before_enabled IS 'Enable night before reminders';
COMMENT ON COLUMN email_settings.reminder_night_before_time IS 'Time to send night before reminders (local time)';
COMMENT ON COLUMN email_settings.reminder_two_hours_enabled IS 'Enable 2-hour before reminders';

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_email_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_email_settings_updated_at
    BEFORE UPDATE ON email_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_email_settings_updated_at();

