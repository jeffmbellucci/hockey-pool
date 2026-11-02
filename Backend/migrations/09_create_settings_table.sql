-- Create settings table to store pool configuration
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on setting_key for faster lookups
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(setting_key);

-- Insert default settings
INSERT INTO settings (setting_key, setting_value, description) VALUES
  ('season_start_date', '2025-10-07', 'The start date of the NHL season'),
  ('season_year', '2025-26', 'The current NHL season year (e.g., 2025-26)'),
  ('pick_deadline_day', 'Monday', 'The day of the week when picks are due'),
  ('pick_deadline_time', '7:00 PM EST', 'The time when picks are due'),
  ('current_week', '1', 'The current week number of the season')
ON CONFLICT (setting_key) DO NOTHING;

-- Add comment to table
COMMENT ON TABLE settings IS 'Stores system-wide configuration settings for the hockey pool';
COMMENT ON COLUMN settings.setting_key IS 'Unique identifier for the setting';
COMMENT ON COLUMN settings.setting_value IS 'The value of the setting stored as text';
COMMENT ON COLUMN settings.description IS 'Human-readable description of what the setting controls';


