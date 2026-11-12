-- People who sign in with Google, and their Google OAuth tokens kept server-side (SEC-01).
-- Tokens are encrypted by the app (AES-256-GCM, TOKEN_ENCRYPTION_KEY) before they reach this table.

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE google_credentials (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_enc TEXT,
  access_token_enc TEXT,
  -- when the access token expires; Google's client refreshes it shortly before
  expiry_date TIMESTAMPTZ,
  scopes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
