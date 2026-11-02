-- Add retry_count column to survivor_notifications for email retry logic
ALTER TABLE survivor_notifications 
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
