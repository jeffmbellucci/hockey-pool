-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  username VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'user' CHECK (type IN ('user', 'admin', 'system')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_type ON chat_messages(type);

-- Add some initial welcome messages
INSERT INTO chat_messages (user_id, username, message, type, created_at) VALUES
  (NULL, 'System', 'Welcome to Pool Chat! Connect with your fellow pool members here.', 'system', NOW() - INTERVAL '7 days'),
  (NULL, 'Admin', 'Remember to check the standings regularly and make your picks on time!', 'admin', NOW() - INTERVAL '5 days');

