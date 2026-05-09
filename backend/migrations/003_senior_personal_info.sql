-- Demo agent credentials for a senior.
-- Apply with: npx @insforge/cli db migrate --file migrations/003_senior_personal_info.sql

CREATE TABLE IF NOT EXISTS senior_personal_info (
  id text PRIMARY KEY,
  senior_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL,
  password text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
