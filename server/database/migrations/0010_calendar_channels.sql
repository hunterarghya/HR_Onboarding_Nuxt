-- Google Calendar push channels (SEC-08). Each HR has at most one; Google sends its token back with every
-- notification, and only its hash is stored. Channels expire, so they're renewed before expires_at.
CREATE TABLE calendar_channels (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL UNIQUE,
  resource_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX calendar_channels_user_id_idx ON calendar_channels (user_id);
CREATE INDEX calendar_channels_expires_at_idx ON calendar_channels (expires_at);
