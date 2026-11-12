-- Fixed value lists, indexes for the hot queries, one row per Google event / form per job,
-- and time-zone-aware timestamps (DATA-05, DATA-06, DATA-08, DATA-09, BUG-09, BUG-13).

-- ---------------------------------------------------------------- fixed value lists (DATA-05)

-- Where a candidate came from. Spelling variants are folded in; anything unrecognisable is dropped.
UPDATE candidates SET applied_through = CASE lower(regexp_replace(applied_through, '[^a-zA-Z]', '', 'g'))
    WHEN 'gmail' THEN 'Gmail'
    WHEN 'whatsapp' THEN 'WhatsApp'
    WHEN 'googleforms' THEN 'GoogleForms'
  END
WHERE applied_through IS NOT NULL;
ALTER TABLE candidates ADD CONSTRAINT candidates_applied_through_check
  CHECK (applied_through IS NULL OR applied_through IN ('Gmail', 'WhatsApp', 'GoogleForms'));

-- The baseline created this as VARCHAR(50) or VARCHAR(20) depending on the database's age (DATA-09).
UPDATE interview_events SET interview_mode = CASE WHEN lower(btrim(interview_mode)) = 'online' THEN 'online' ELSE 'offline' END;
ALTER TABLE interview_events
  ALTER COLUMN interview_mode TYPE VARCHAR(20),
  ALTER COLUMN interview_mode SET NOT NULL,
  ADD CONSTRAINT interview_events_interview_mode_check CHECK (interview_mode IN ('online', 'offline'));

UPDATE email_templates SET type = 'custom' WHERE type NOT IN ('custom', 'rejection', 'invite', 'offer');
ALTER TABLE email_templates ADD CONSTRAINT email_templates_type_check CHECK (type IN ('custom', 'rejection', 'invite', 'offer'));

-- ---------------------------------------------------------------- one row per Google Calendar event (BUG-09)

-- Duplicates from parallel syncs: keep the first import; its candidate places take over the copies'.
CREATE TEMP TABLE event_duplicates ON COMMIT DROP AS
SELECT id, keep_id FROM (
  SELECT id, min(id) OVER (PARTITION BY google_event_id) AS keep_id
  FROM interview_events WHERE google_event_id IS NOT NULL
) ranked WHERE id <> keep_id;

UPDATE interview_candidates ic SET event_id = d.keep_id
FROM event_duplicates d
WHERE ic.event_id = d.id
  AND NOT EXISTS (SELECT 1 FROM interview_candidates x WHERE x.event_id = d.keep_id AND x.candidate_id = ic.candidate_id);
DELETE FROM interview_events e USING event_duplicates d WHERE e.id = d.id;

CREATE UNIQUE INDEX interview_events_google_event_id_unique ON interview_events (google_event_id) WHERE google_event_id IS NOT NULL;

-- ---------------------------------------------------------------- one form per job (BUG-13)

-- Older extra forms of a job are kept (they're still scanned) but no longer attached to it.
UPDATE google_forms f SET job_role_id = NULL
WHERE f.job_role_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM google_forms n WHERE n.job_role_id = f.job_role_id AND (n.created_at, n.id) > (f.created_at, f.id));
CREATE UNIQUE INDEX google_forms_job_role_unique ON google_forms (job_role_id);

-- ---------------------------------------------------------------- deleting a candidate (DATA-09)

-- (the old constraint is found by column: databases older than the baseline may have named it differently)
DO $$
DECLARE old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'interview_candidates'::regclass AND c.contype = 'f' AND a.attname = 'candidate_id';
  IF old_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE interview_candidates DROP CONSTRAINT %I', old_name);
  END IF;
END $$;
ALTER TABLE interview_candidates ADD CONSTRAINT interview_candidates_candidate_id_fkey
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------- time-zone-aware timestamps (DATA-08)

-- These were all written by the database clock, so they're read in the database's own time zone.
ALTER TABLE job_roles ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at, ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE interview_events ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at, ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE interview_candidates ALTER COLUMN assigned_at TYPE TIMESTAMPTZ USING assigned_at, ALTER COLUMN assigned_at SET DEFAULT now();
ALTER TABLE email_templates
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at, ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at, ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE google_forms ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at, ALTER COLUMN created_at SET DEFAULT now();

-- Scan watermarks were written by the app in its own time zone, which isn't known here. Reading them as
-- UTC and stepping back 14 hours (the widest time zone offset) means the next scan may re-read a few
-- hours of messages, but never skips any.
ALTER TABLE scan_timestamps ALTER COLUMN last_scanned_at TYPE TIMESTAMPTZ
  USING (last_scanned_at AT TIME ZONE 'UTC') - interval '14 hours';

-- Application times to the millisecond, the precision page cursors carry, so the list can page on the
-- column itself (and its index) instead of truncating every row.
ALTER TABLE candidates ALTER COLUMN date_applied TYPE TIMESTAMPTZ(3);

-- ---------------------------------------------------------------- indexes for the hot queries (DATA-06)

-- candidate list: newest first, by job, by status, by score
CREATE INDEX candidates_date_applied_idx ON candidates (date_applied DESC, id DESC);
CREATE INDEX candidates_job_status_score_idx ON candidates (job_role_id, status, score DESC);
DROP INDEX candidates_job_role_id_idx; -- covered by the one above
CREATE INDEX candidates_role_applied_idx ON candidates (role_applied);
-- removing a candidate (cascade) and "already placed in another event"
CREATE INDEX interview_candidates_candidate_id_idx ON interview_candidates (candidate_id);
-- (interview_candidates(event_id, …) is covered by its UNIQUE (event_id, candidate_id);
--  candidates(lower(email), …) by candidates_identity)
