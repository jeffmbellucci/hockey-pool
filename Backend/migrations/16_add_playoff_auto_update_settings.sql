-- Migration 16: Add playoff standings auto-update settings
-- This adds settings to control automatic fetching of playoff standings

-- Add auto-update settings for playoff standings
INSERT INTO settings (setting_key, setting_value, description) VALUES
  ('playoff_auto_update_enabled', 'false', 'Enable/disable automatic fetching of playoff standings'),
  ('playoff_auto_update_interval_hours', '24', 'Interval in hours between automatic playoff standings updates (e.g., 5, 10, 24)'),
  ('playoff_last_auto_update', '', 'Timestamp of the last automatic playoff standings update')
ON CONFLICT (setting_key) DO NOTHING;

