-- Job roles: salary and experience become numbers, and the database enforces the job's rules.
-- (Free text like "$100k - $120k" could not be filtered, sorted or validated: VAL-01, DATA-02.)

ALTER TABLE job_roles
  ADD COLUMN salary_min NUMERIC(14, 2),
  ADD COLUMN salary_max NUMERIC(14, 2),
  ADD COLUMN experience_min_years NUMERIC(4, 1);

-- Best-effort carry-over of the old free text: the first number in it, when it fits.
-- (Nothing is deployed; anything that doesn't parse simply becomes empty and can be re-entered.)
UPDATE job_roles SET salary_min = n
FROM (SELECT id, substring(salary FROM '[0-9]+(?:\.[0-9]+)?')::numeric AS n FROM job_roles WHERE salary ~ '[0-9]') s
WHERE job_roles.id = s.id AND s.n < 1e12;
UPDATE job_roles SET salary_max = salary_min;

UPDATE job_roles SET experience_min_years = n
FROM (SELECT id, substring(experience FROM '[0-9]+(?:\.[0-9]+)?')::numeric AS n FROM job_roles WHERE experience ~ '[0-9]') e
WHERE job_roles.id = e.id AND e.n <= 60;

ALTER TABLE job_roles DROP COLUMN salary, DROP COLUMN experience;

-- Rules the API also checks, so bad data can't get in another way
UPDATE job_roles SET shortlist_mode = 'manual' WHERE shortlist_mode IS NULL OR shortlist_mode NOT IN ('manual', 'auto');
UPDATE job_roles SET min_score = LEAST(GREATEST(COALESCE(min_score, 60), 0), 100);
UPDATE job_roles SET criteria_weights = '{}' WHERE criteria_weights IS NULL;

ALTER TABLE job_roles
  ALTER COLUMN shortlist_mode SET NOT NULL,
  ALTER COLUMN min_score SET NOT NULL,
  ALTER COLUMN criteria_weights SET NOT NULL,
  ALTER COLUMN deadline TYPE TIMESTAMPTZ USING deadline AT TIME ZONE 'UTC',
  ADD CONSTRAINT job_roles_shortlist_mode_check CHECK (shortlist_mode IN ('manual', 'auto')),
  ADD CONSTRAINT job_roles_min_score_check CHECK (min_score BETWEEN 0 AND 100),
  ADD CONSTRAINT job_roles_salary_check CHECK (
    (salary_min IS NULL OR salary_min >= 0) AND (salary_max IS NULL OR salary_max >= 0)
    AND (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max)),
  ADD CONSTRAINT job_roles_experience_check CHECK (experience_min_years IS NULL OR experience_min_years BETWEEN 0 AND 60),
  ADD CONSTRAINT job_roles_role_not_blank CHECK (btrim(role) <> '');
