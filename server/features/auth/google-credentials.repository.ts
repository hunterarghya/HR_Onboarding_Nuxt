import { config } from '~~/server/config/env'
import { decrypt, encrypt } from '~~/server/core/crypto'
import { getPool, type Queryable } from '~~/server/core/db/pool'
import type { GoogleCredentials } from '~~/server/integrations/google/oauth'

// Google OAuth tokens per user. Encryption happens here, so plaintext tokens never reach the table
// and callers only ever see Google's own Credentials shape.

interface GoogleCredentialsRow {
  user_id: number
  refresh_token_enc: string | null
  access_token_enc: string | null
  expiry_date: Date | null
  scopes: string | null
}

const seal = (value: string | null | undefined) => (value ? encrypt(value, config.auth.tokenEncryptionKey) : null)
const open = (value: string | null) => (value ? decrypt(value, config.auth.tokenEncryptionKey) : null)

export const googleCredentialsRepository = {
  async find(userId: number, db: Queryable = getPool()): Promise<GoogleCredentials | null> {
    const { rows } = await db.query<GoogleCredentialsRow>('SELECT * FROM google_credentials WHERE user_id = $1', [userId])
    const row = rows[0]
    if (!row) return null
    return {
      refresh_token: open(row.refresh_token_enc),
      access_token: open(row.access_token_enc),
      expiry_date: row.expiry_date ? row.expiry_date.getTime() : null,
      scope: row.scopes ?? undefined
    }
  },

  /**
   * Stores tokens from a sign-in or a refresh. Google only sends a refresh token on consent, so a
   * missing one keeps the stored refresh token.
   */
  async save(userId: number, tokens: GoogleCredentials, db: Queryable = getPool()) {
    await db.query(
      `INSERT INTO google_credentials (user_id, refresh_token_enc, access_token_enc, expiry_date, scopes, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id) DO UPDATE SET
         refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, google_credentials.refresh_token_enc),
         access_token_enc = EXCLUDED.access_token_enc,
         expiry_date = EXCLUDED.expiry_date,
         scopes = COALESCE(EXCLUDED.scopes, google_credentials.scopes),
         updated_at = now()`,
      [userId, seal(tokens.refresh_token), seal(tokens.access_token), tokens.expiry_date ? new Date(tokens.expiry_date) : null, tokens.scope ?? null]
    )
  }
}
