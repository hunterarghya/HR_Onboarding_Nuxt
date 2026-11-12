-- Resumes are personal data (SEC-10). New uploads are private ImageKit files, opened through a short-lived
-- signed link from GET /api/candidates/:id/resume (signed-in HRs only).
-- resume_file holds where the file is: an ImageKit path for private files, or the full public URL of a
-- resume uploaded before this change. resume_url, which the API returns, is now that route.
ALTER TABLE candidates RENAME COLUMN resume_url TO resume_file;
ALTER TABLE candidates ADD COLUMN resume_url TEXT GENERATED ALWAYS AS (
  CASE WHEN resume_file IS NOT NULL THEN '/api/candidates/' || id || '/resume' END
) STORED;
