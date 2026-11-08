CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  college_email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  report_type TEXT NOT NULL CHECK (report_type IN ('LOST', 'FOUND')),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  ai_description TEXT,
  colour TEXT,
  location_text TEXT NOT NULL,
  event_date TEXT NOT NULL,
  approximate_time TEXT,
  custody_location TEXT,
  contact_preference TEXT NOT NULL DEFAULT 'IN_APP',
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'MATCHED', 'CLAIMED', 'RESOLVED', 'EXPIRED', 'REMOVED')),
  image_path TEXT,
  ai_status TEXT NOT NULL DEFAULT 'DISABLED'
    CHECK (ai_status IN ('DISABLED', 'PENDING', 'SUCCEEDED', 'FAILED')),
  ai_model TEXT,
  ai_confidence REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('AI', 'USER', 'OCR'))
);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  report_id TEXT REFERENCES reports(id),
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id),
  claimant_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
CREATE INDEX IF NOT EXISTS idx_claims_report ON claims(report_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
