-- Baseline: the schema the app created at boot before versioned migrations (Phase 4).
-- Idempotent on purpose, so a database created by the old boot code is adopted as-is.

CREATE TABLE IF NOT EXISTS job_roles (
  id SERIAL PRIMARY KEY,
  role VARCHAR(255) NOT NULL,
  salary VARCHAR(100),
  qualification TEXT,
  skills TEXT,
  experience VARCHAR(100),
  location VARCHAR(255),
  shortlist_mode VARCHAR(20) DEFAULT 'manual',
  deadline TIMESTAMP,
  min_score INTEGER DEFAULT 60,
  criteria_weights JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  role_applied VARCHAR(255),
  date_applied TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resume_content TEXT,
  score INTEGER,
  experience_level VARCHAR(100),
  status VARCHAR(50) DEFAULT 'shortlisted',
  resume_url TEXT,
  applied_through VARCHAR(50),
  current_location VARCHAR(255),
  current_ctc VARCHAR(100),
  offered_role VARCHAR(255),
  offered_salary VARCHAR(100),
  offered_location VARCHAR(255),
  joining_date DATE,
  offer_sent BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS scan_timestamps (
  id SERIAL PRIMARY KEY,
  source_type VARCHAR(20) NOT NULL,
  source_id VARCHAR(255) NOT NULL DEFAULT 'default',
  last_scanned_at TIMESTAMP NOT NULL DEFAULT '1970-01-01',
  UNIQUE(source_type, source_id)
);

CREATE TABLE IF NOT EXISTS interview_events (
  id SERIAL PRIMARY KEY,
  role VARCHAR(255) NOT NULL,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  num_candidates INTEGER DEFAULT 5,
  extra_candidates INTEGER DEFAULT 0,
  interview_mode VARCHAR(50) DEFAULT 'offline',
  venue_or_link TEXT,
  google_event_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interview_candidates (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES interview_events(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  invite_sent BOOLEAN DEFAULT false,
  UNIQUE(event_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  type VARCHAR(50) NOT NULL DEFAULT 'custom',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS google_forms (
  id SERIAL PRIMARY KEY,
  form_id VARCHAR(255) NOT NULL UNIQUE,
  form_url TEXT NOT NULL,
  form_title VARCHAR(500),
  job_role_id INTEGER REFERENCES job_roles(id) ON DELETE SET NULL,
  question_map JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Columns added to the original tables over time (no-ops on a fresh database)
ALTER TABLE job_roles ADD COLUMN IF NOT EXISTS criteria_weights JSONB DEFAULT '{}';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS offered_role VARCHAR(255);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS offered_salary VARCHAR(100);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS offered_location VARCHAR(255);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS joining_date DATE;
ALTER TABLE interview_events ADD COLUMN IF NOT EXISTS interview_mode VARCHAR(20) DEFAULT 'offline';
ALTER TABLE interview_events ADD COLUMN IF NOT EXISTS venue_or_link TEXT;
ALTER TABLE interview_candidates ADD COLUMN IF NOT EXISTS invite_sent BOOLEAN DEFAULT false;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS offer_sent BOOLEAN DEFAULT false;
