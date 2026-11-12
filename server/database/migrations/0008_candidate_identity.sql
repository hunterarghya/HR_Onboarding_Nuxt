-- Unknown candidate details are NULL, not 'N/A' (DATA-04), and a candidate is one email per job (DATA-01).

UPDATE candidates SET email = NULL WHERE btrim(email) IN ('', 'N/A');
UPDATE candidates SET phone = NULL WHERE btrim(phone) IN ('', 'N/A');
UPDATE candidates SET current_location = NULL WHERE btrim(current_location) IN ('', 'N/A');

-- Emails were sometimes stored as a whole Gmail "From" header ("Name <a@b.com>") or as a WhatsApp
-- sender id ("9198…@c.us"). Keep just the address, or nothing.
UPDATE candidates SET email = substring(email FROM '<([^<>[:space:]]+@[^<>[:space:]]+)>') WHERE email ~ '<[^<>[:space:]]+@[^<>[:space:]]+>';
UPDATE candidates SET email = lower(btrim(email)) WHERE email IS NOT NULL;
UPDATE candidates SET email = NULL WHERE email ~* '@(c|g)\.us$|@s\.whatsapp\.net$|@lid$' OR email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';

-- Same email + same job more than once (parallel scans): keep one candidate, preferring a selected one,
-- then the latest application; interview places move over to it.
CREATE TEMP TABLE candidate_duplicates ON COMMIT DROP AS
SELECT id, keep_id FROM (
  SELECT id, first_value(id) OVER (
    PARTITION BY email, job_role_id
    ORDER BY (status = 'selected') DESC, date_applied DESC, id DESC
  ) AS keep_id
  FROM candidates WHERE email IS NOT NULL
) ranked WHERE id <> keep_id;

UPDATE interview_candidates ic SET candidate_id = d.keep_id
FROM candidate_duplicates d
WHERE ic.candidate_id = d.id
  AND NOT EXISTS (SELECT 1 FROM interview_candidates x WHERE x.event_id = ic.event_id AND x.candidate_id = d.keep_id);
DELETE FROM interview_candidates ic USING candidate_duplicates d WHERE ic.candidate_id = d.id;
DELETE FROM candidates c USING candidate_duplicates d WHERE c.id = d.id;

CREATE UNIQUE INDEX candidates_identity ON candidates (lower(email), job_role_id) NULLS NOT DISTINCT WHERE email IS NOT NULL;
