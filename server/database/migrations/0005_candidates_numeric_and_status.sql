-- Candidates: a fixed set of statuses, and money / experience stored as numbers (VAL-03, DATA-02).

-- Statuses the app uses. Anything else (missing, or corrupted values such as the {"isTrusted":false}
-- the interviews page used to write, BUG-17) becomes 'applied', the start of the pipeline.
UPDATE candidates SET status = 'applied'
WHERE status IS NULL OR status NOT IN ('applied', 'shortlisted', 'hold', 'rejected', 'marked', 'selected');

ALTER TABLE candidates
  ALTER COLUMN status SET NOT NULL,
  ADD CONSTRAINT candidates_status_check CHECK (status IN ('applied', 'shortlisted', 'hold', 'rejected', 'marked', 'selected'));

-- Current CTC as parsed from resumes: "8 LPA" / "8.5 lakhs" → 850000, "1.2 cr" → 12000000. 'N/A' → NULL.
ALTER TABLE candidates ALTER COLUMN current_ctc TYPE NUMERIC(14, 2) USING (
  CASE
    WHEN current_ctc !~ '[0-9]' THEN NULL
    WHEN current_ctc ~* '(cr|crore)' THEN substring(replace(current_ctc, ',', '') FROM '[0-9]+(?:\.[0-9]+)?')::numeric * 10000000
    WHEN current_ctc ~* '(lpa|lakh|lac|[0-9 ]l\M)' THEN substring(replace(current_ctc, ',', '') FROM '[0-9]+(?:\.[0-9]+)?')::numeric * 100000
    ELSE substring(replace(current_ctc, ',', '') FROM '[0-9]+(?:\.[0-9]+)?')::numeric
  END);

-- Offered salary as typed by HR, e.g. "₹12,00,000 / year" → 1200000.
ALTER TABLE candidates ALTER COLUMN offered_salary TYPE NUMERIC(14, 2) USING (
  CASE WHEN offered_salary ~ '[0-9]' THEN substring(replace(offered_salary, ',', '') FROM '[0-9]+(?:\.[0-9]+)?')::numeric END);

-- "3 years" → 3
ALTER TABLE candidates RENAME COLUMN experience_level TO experience_years;
ALTER TABLE candidates ALTER COLUMN experience_years TYPE NUMERIC(4, 1) USING (
  CASE WHEN experience_years ~ '[0-9]' AND substring(experience_years FROM '[0-9]+(?:\.[0-9]+)?')::numeric <= 60
    THEN substring(experience_years FROM '[0-9]+(?:\.[0-9]+)?')::numeric END);

ALTER TABLE candidates
  ADD CONSTRAINT candidates_money_check CHECK ((current_ctc IS NULL OR current_ctc >= 0) AND (offered_salary IS NULL OR offered_salary >= 0)),
  ADD CONSTRAINT candidates_experience_check CHECK (experience_years IS NULL OR experience_years BETWEEN 0 AND 60);
