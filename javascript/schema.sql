CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  username TEXT UNIQUE,
  full_name TEXT,
  join_date TEXT NOT NULL,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  remind_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_sent INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS broadcast_sessions (
  user_id INTEGER PRIMARY KEY
);

CREATE INDEX IF NOT EXISTS idx_reminders_due
ON reminders(is_sent, remind_at);

CREATE INDEX IF NOT EXISTS idx_reminders_user
ON reminders(user_id, is_sent);
