-- Bind PawBot app profiles to InsForge Auth users.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_user_id text;

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_key
  ON users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;
