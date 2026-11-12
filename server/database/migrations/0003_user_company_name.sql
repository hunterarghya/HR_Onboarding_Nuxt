-- Each HR enters their own company name; outgoing emails use the sender's.
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);

-- The default templates now say {{company_name}} instead of a fixed name. Defaults can't be edited
-- in the app, so they are removed here and the boot seed re-creates them with the placeholder.
DELETE FROM email_templates WHERE is_default = true;
