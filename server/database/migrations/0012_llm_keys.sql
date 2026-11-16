-- Each HR's own AI keys (Groq, Gemini), encrypted like the Google tokens (TOKEN_ENCRYPTION_KEY).
-- An HR keeps one key per provider and picks which provider the app uses for their work;
-- users.llm_provider NULL means the server's default (LLM_PROVIDER).
CREATE TABLE llm_keys (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('groq', 'gemini')),
  api_key_encrypted TEXT NOT NULL,
  -- the key's last characters, so the HR can tell keys apart; the key itself is never sent back
  key_hint TEXT NOT NULL,
  model TEXT NOT NULL CHECK (btrim(model) <> ''),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

ALTER TABLE users ADD COLUMN llm_provider TEXT CHECK (llm_provider IN ('groq', 'gemini'));
