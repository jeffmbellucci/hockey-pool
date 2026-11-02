-- Create pool participants table for the 16 players
CREATE TABLE IF NOT EXISTS pool_participants (
    participant_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    participant_name VARCHAR(100) NOT NULL UNIQUE,
    draft_order INTEGER UNIQUE NOT NULL CHECK (draft_order BETWEEN 1 AND 16),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_pool_participants_user ON pool_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_pool_participants_draft_order ON pool_participants(draft_order);

-- Create trigger to update the updated_at column
CREATE TRIGGER trigger_update_pool_participants_updated_at
    BEFORE UPDATE ON pool_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_stats_updated_at();

