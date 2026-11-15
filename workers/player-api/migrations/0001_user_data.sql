CREATE TABLE IF NOT EXISTS user_data (
  google_sub TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_data_updated_at
ON user_data(updated_at);
