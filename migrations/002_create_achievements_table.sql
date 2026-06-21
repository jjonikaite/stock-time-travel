-- Migration: create achievements table
CREATE TABLE IF NOT EXISTS achievements (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  achievement_key TEXT NOT NULL,
  achievement_name TEXT NOT NULL,
  achievement_description TEXT NOT NULL,
  icon TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure the same achievement cannot be unlocked twice for the same user
CREATE UNIQUE INDEX IF NOT EXISTS achievements_user_key_unique_idx
  ON achievements (user_id, achievement_key);

-- Additional indexes for query performance
CREATE INDEX IF NOT EXISTS achievements_user_id_idx
  ON achievements (user_id);

CREATE INDEX IF NOT EXISTS achievements_key_idx
  ON achievements (achievement_key);
