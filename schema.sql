CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  clearance TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  mfa_setup INTEGER NOT NULL DEFAULT 0,
  mfa_secret TEXT,
  temp_secret TEXT,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  sender_username TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'general',
  text TEXT NOT NULL,
  timestamp TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel, timestamp);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  operator_username TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'STANDARD',
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  event TEXT NOT NULL,
  username TEXT,
  ip TEXT,
  details TEXT
);

CREATE TABLE IF NOT EXISTS system_status (
  name TEXT PRIMARY KEY,
  down INTEGER NOT NULL DEFAULT 0,
  message TEXT DEFAULT '',
  updated_at TEXT,
  updated_by TEXT
);
