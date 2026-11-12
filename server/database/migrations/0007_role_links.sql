-- Candidates and interview events point at their job by id (DATA-03), so renaming a job no longer
-- detaches them (BUG-10). No job (NULL) means the "Open" pool / an "Open Role" event.
-- role_applied and interview_events.role stay as the display name, kept in step by the app.

-- Job names identify jobs to people (filters, events, the AI's role list), so they must be unique.
-- Existing duplicates, and jobs using the reserved names "Open" / "Open Role", get their id appended,
-- e.g. "Backend Developer (12)".
UPDATE job_roles j SET role = btrim(j.role) || ' (' || j.id || ')'
WHERE lower(btrim(j.role)) IN ('open', 'open role')
   OR EXISTS (SELECT 1 FROM job_roles o WHERE lower(btrim(o.role)) = lower(btrim(j.role)) AND o.id < j.id);
CREATE UNIQUE INDEX job_roles_role_unique ON job_roles (lower(btrim(role)));

ALTER TABLE candidates ADD COLUMN job_role_id INTEGER REFERENCES job_roles(id) ON DELETE SET NULL;
UPDATE candidates c SET job_role_id = j.id, role_applied = j.role FROM job_roles j WHERE lower(btrim(j.role)) = lower(btrim(c.role_applied));
UPDATE candidates SET role_applied = 'Open' WHERE job_role_id IS NULL;
CREATE INDEX candidates_job_role_id_idx ON candidates (job_role_id);

ALTER TABLE interview_events ADD COLUMN job_role_id INTEGER REFERENCES job_roles(id) ON DELETE SET NULL;
UPDATE interview_events e SET job_role_id = j.id, role = j.role FROM job_roles j WHERE lower(btrim(j.role)) = lower(btrim(e.role));
UPDATE interview_events SET role = 'Open Role' WHERE job_role_id IS NULL;
CREATE INDEX interview_events_job_role_id_idx ON interview_events (job_role_id);
