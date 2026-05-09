-- PawBot initial schema
-- Apply with: npx @insforge/cli db migrate --file migrations/001_initial_schema.sql

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('senior', 'caretaker')),
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS care_relationships (
  id text PRIMARY KEY,
  caretaker_id text NOT NULL REFERENCES users(id),
  senior_id text NOT NULL REFERENCES users(id),
  permission_level text NOT NULL DEFAULT 'manager'
);

CREATE TABLE IF NOT EXISTS medications (
  id text PRIMARY KEY,
  senior_id text NOT NULL REFERENCES users(id),
  created_by text NOT NULL,
  name text NOT NULL,
  dosage text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  times text[] NOT NULL DEFAULT '{}',
  frequency text NOT NULL DEFAULT 'daily',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medication_logs (
  id text PRIMARY KEY,
  medication_id text NOT NULL REFERENCES medications(id),
  senior_id text NOT NULL REFERENCES users(id),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  confirmed_at timestamptz,
  reply_text text,
  follow_up_sent_at timestamptz
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id text PRIMARY KEY,
  senior_id text NOT NULL REFERENCES users(id),
  created_by text NOT NULL,
  title text NOT NULL,
  event_type text NOT NULL DEFAULT 'custom',
  date timestamptz NOT NULL,
  recurrence text,
  reminder_time text NOT NULL DEFAULT '09:00',
  reminder_sent_at timestamptz
);

CREATE TABLE IF NOT EXISTS scam_alerts (
  id text PRIMARY KEY,
  senior_id text NOT NULL REFERENCES users(id),
  source text NOT NULL,
  risk_level text NOT NULL,
  summary text NOT NULL,
  action_taken text NOT NULL DEFAULT 'logged',
  caretaker_notified boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_logs (
  id text PRIMARY KEY,
  senior_id text NOT NULL REFERENCES users(id),
  agent_action text NOT NULL,
  context_used jsonb,
  result jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hyperspell_connections (
  id text PRIMARY KEY,
  senior_id text NOT NULL REFERENCES users(id),
  provider text NOT NULL,
  connected_at timestamptz DEFAULT now(),
  UNIQUE (senior_id, provider)
);

-- Real-time channel for per-senior caretaker dashboard updates
INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('senior:%', 'Per-senior event stream for the caretaker dashboard', true)
ON CONFLICT (pattern) DO NOTHING;

-- Trigger: push medication log changes to the caretaker dashboard
CREATE OR REPLACE FUNCTION notify_medication_log_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM realtime.publish(
    'senior:' || NEW.senior_id,
    'medication_update',
    jsonb_build_object(
      'logId', NEW.id,
      'medicationId', NEW.medication_id,
      'status', NEW.status,
      'confirmedAt', NEW.confirmed_at,
      'scheduledFor', NEW.scheduled_for
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER medication_log_realtime
  AFTER INSERT OR UPDATE ON medication_logs
  FOR EACH ROW
  EXECUTE FUNCTION notify_medication_log_change();

-- Trigger: push new scam alerts to the caretaker dashboard
CREATE OR REPLACE FUNCTION notify_scam_alert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM realtime.publish(
    'senior:' || NEW.senior_id,
    'scam_alert',
    jsonb_build_object(
      'alertId', NEW.id,
      'source', NEW.source,
      'riskLevel', NEW.risk_level,
      'summary', NEW.summary
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER scam_alert_realtime
  AFTER INSERT ON scam_alerts
  FOR EACH ROW
  EXECUTE FUNCTION notify_scam_alert();

-- Trigger: push new agent logs to the caretaker dashboard
CREATE OR REPLACE FUNCTION notify_agent_log()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM realtime.publish(
    'senior:' || NEW.senior_id,
    'agent_log',
    jsonb_build_object(
      'logId', NEW.id,
      'agentAction', NEW.agent_action,
      'createdAt', NEW.created_at
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER agent_log_realtime
  AFTER INSERT ON agent_logs
  FOR EACH ROW
  EXECUTE FUNCTION notify_agent_log();
