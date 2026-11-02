-- Migration 33: Create user_notification_preferences table
-- Allows users to customize their notification preferences per contest

CREATE TABLE IF NOT EXISTS user_notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contest_id INTEGER NOT NULL REFERENCES contests(contest_id) ON DELETE CASCADE,
    email_reminders BOOLEAN DEFAULT TRUE,
    email_eliminations BOOLEAN DEFAULT TRUE,
    email_results BOOLEAN DEFAULT TRUE,
    email_advancement BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_contest_prefs UNIQUE(user_id, contest_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON user_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_contest ON user_notification_preferences(contest_id);

-- Composite index for looking up preferences
CREATE INDEX IF NOT EXISTS idx_notification_prefs_lookup 
    ON user_notification_preferences(user_id, contest_id);

-- Add comments
COMMENT ON TABLE user_notification_preferences IS 'User notification preferences for survivor contests';
COMMENT ON COLUMN user_notification_preferences.email_reminders IS 'Send pick reminder emails (night before, 2 hours before)';
COMMENT ON COLUMN user_notification_preferences.email_eliminations IS 'Send elimination notification emails';
COMMENT ON COLUMN user_notification_preferences.email_results IS 'Send weekly result emails';
COMMENT ON COLUMN user_notification_preferences.email_advancement IS 'Send playoff advancement emails';

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notification_preferences_updated_at
    BEFORE UPDATE ON user_notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_preferences_updated_at();

-- Create default preferences when a user joins a survivor contest
-- This function can be called from the application when a user joins
CREATE OR REPLACE FUNCTION create_default_notification_preferences(
    p_user_id INTEGER,
    p_contest_id INTEGER
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_notification_preferences (
        user_id, 
        contest_id, 
        email_reminders, 
        email_eliminations, 
        email_results, 
        email_advancement
    )
    VALUES (
        p_user_id, 
        p_contest_id, 
        TRUE, 
        TRUE, 
        TRUE, 
        TRUE
    )
    ON CONFLICT (user_id, contest_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_default_notification_preferences(INTEGER, INTEGER) IS 
    'Creates default notification preferences for a user joining a survivor contest';
