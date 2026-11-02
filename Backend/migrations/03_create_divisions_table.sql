-- Create divisions table for NHL conference and division organization
CREATE TABLE IF NOT EXISTS divisions (
    division_id SERIAL PRIMARY KEY,
    conference_name VARCHAR(50) NOT NULL,
    division_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (conference_name, division_name)
);

-- Insert the four NHL divisions
INSERT INTO divisions (conference_name, division_name) VALUES
('Eastern', 'Metropolitan'),  -- division_id = 1
('Eastern', 'Atlantic'),      -- division_id = 2
('Western', 'Central'),       -- division_id = 3
('Western', 'Pacific')        -- division_id = 4
ON CONFLICT (conference_name, division_name) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_divisions_conference ON divisions(conference_name);

