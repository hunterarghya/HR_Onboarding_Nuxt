-- When a candidate applied: an absolute point in time, always set (it orders the candidate list and its pages).
-- Existing values were written by the database clock, so they're read in the database's own time zone.
UPDATE candidates SET date_applied = CURRENT_TIMESTAMP WHERE date_applied IS NULL;

ALTER TABLE candidates
  ALTER COLUMN date_applied TYPE TIMESTAMPTZ USING date_applied,
  ALTER COLUMN date_applied SET DEFAULT now(),
  ALTER COLUMN date_applied SET NOT NULL;
