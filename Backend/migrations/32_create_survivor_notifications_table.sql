-- Migration 32: Create survivor_notifications table
-- Tracks scheduled and sent notifications for survivor contests

CREATE TABLE IF NOT EXISTS survivor_notifications (
    id SERIAL PRIMARY KEY,
    contest_id INTEGER NOT NULL REFERENCES contests(contest_id) ON DELETE CASCADE,
    week_number INTEGER,
    playoff_round INTEGER,
    playoff_game_number INTEGER,
    notification_type VARCHAR(50) NOT NULL,
    scheduled_time TIMESTAMP NOT NULL,
    sent_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending',
    recipients_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_survivor_notifications_contest ON survivor_notifications(contest_id);
CREATE INDEX IF NOT EXISTS idx_survivor_notifications_status ON survivor_notifications(status);
CREATE INDEX IF NOT EXISTS idx_survivor_notifications_scheduled ON survivor_notifications(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_survivor_notifications_type ON survivor_notifications(notification_type);

-- Composite index for finding pending notifications to send
CREATE INDEX IF NOT EXISTS idx_survivor_notifications_pending 
    ON survivor_notifications(status, scheduled_time) 
    WHERE status = 'pending';

-- Add comments
COMMENT ON TABLE survivor_notifications IS 'Tracks scheduled and sent notifications for survivor contests';
COMMENT ON COLUMN survivor_notifications.week_number IS 'Week number (1-26) for regular season notifications';
COMMENT ON COLUMN survivor_notifications.playoff_round IS 'Playoff round (1-4) for playoff notifications';
COMMENT ON COLUMN survivor_notifications.playoff_game_number IS 'Playoff game number (1-7) for playoff notifications';
COMMENT ON COLUMN survivor_notifications.notification_type IS 'Type: night_before, two_hours_before, week_results, elimination, advancement';
COMMENT ON COLUMN survivor_notifications.scheduled_time IS 'When the notification should be sent';
COMMENT ON COLUMN survivor_notifications.sent_at IS 'When the notification was actually sent';
COMMENT ON COLUMN survivor_notifications.status IS 'Status: pending, sent, failed, cancelled';
COMMENT ON COLUMN survivor_notifications.recipients_count IS 'Number of recipients who received the notification';
COMMENT ON COLUMN survivor_notifications.error_message IS 'Error message if notification failed to send';

-- Validation constraints (using DO blocks to avoid errors if they already exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_week' AND conrelid = 'survivor_notifications'::regclass) THEN
        ALTER TABLE survivor_notifications ADD CONSTRAINT check_notification_week 
            CHECK (week_number IS NULL OR (week_number >= 1 AND week_number <= 26));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_playoff_round' AND conrelid = 'survivor_notifications'::regclass) THEN
        ALTER TABLE survivor_notifications ADD CONSTRAINT check_notification_playoff_round 
            CHECK (playoff_round IS NULL OR (playoff_round >= 1 AND playoff_round <= 4));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_playoff_game' AND conrelid = 'survivor_notifications'::regclass) THEN
        ALTER TABLE survivor_notifications ADD CONSTRAINT check_notification_playoff_game 
            CHECK (playoff_game_number IS NULL OR (playoff_game_number >= 1 AND playoff_game_number <= 7));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_type' AND conrelid = 'survivor_notifications'::regclass) THEN
        ALTER TABLE survivor_notifications ADD CONSTRAINT check_notification_type 
            CHECK (notification_type IN (
                'night_before', 
                'two_hours_before', 
                'week_results', 
                'elimination', 
                'advancement',
                'playoff_reminder',
                'contest_start'
            ));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_notification_status' AND conrelid = 'survivor_notifications'::regclass) THEN
        ALTER TABLE survivor_notifications ADD CONSTRAINT check_notification_status 
            CHECK (status IN ('pending', 'sent', 'failed', 'cancelled'));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_recipients_count' AND conrelid = 'survivor_notifications'::regclass) THEN
        ALTER TABLE survivor_notifications ADD CONSTRAINT check_recipients_count 
            CHECK (recipients_count >= 0);
    END IF;
END $$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_survivor_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_survivor_notifications_updated_at
    BEFORE UPDATE ON survivor_notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_survivor_notifications_updated_at();
