import { getPool, type Queryable } from '~~/server/core/db/pool'
import type { KeyProviderName } from '~~/server/integrations/llm'

export interface LlmKeyRow {
  user_id: number
  provider: KeyProviderName
  api_key_encrypted: string
  key_hint: string
  model: string
  updated_at: Date
}

export const aiSettingsRepository = {
  async findKeys(userId: number, db: Queryable = getPool()) {
    const { rows } = await db.query<LlmKeyRow>('SELECT * FROM llm_keys WHERE user_id = $1 ORDER BY provider', [userId])
    return rows
  },

  async findKey(userId: number, provider: KeyProviderName, db: Queryable = getPool()) {
    const { rows } = await db.query<LlmKeyRow>('SELECT * FROM llm_keys WHERE user_id = $1 AND provider = $2', [userId, provider])
    return rows[0] ?? null
  },

  async upsertKey(k: Omit<LlmKeyRow, 'updated_at'>, db: Queryable = getPool()) {
    await db.query(
      `INSERT INTO llm_keys (user_id, provider, api_key_encrypted, key_hint, model)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, provider)
       DO UPDATE SET api_key_encrypted = EXCLUDED.api_key_encrypted, key_hint = EXCLUDED.key_hint, model = EXCLUDED.model, updated_at = now()`,
      [k.user_id, k.provider, k.api_key_encrypted, k.key_hint, k.model]
    )
  },

  /** True if a key was removed. */
  async deleteKey(userId: number, provider: KeyProviderName, db: Queryable = getPool()) {
    const { rowCount } = await db.query('DELETE FROM llm_keys WHERE user_id = $1 AND provider = $2', [userId, provider])
    return rowCount === 1
  },

  /** The provider the HR picked, or null for the server's default. */
  async getActive(userId: number, db: Queryable = getPool()) {
    const { rows } = await db.query<{ llm_provider: KeyProviderName | null }>('SELECT llm_provider FROM users WHERE id = $1', [userId])
    return rows[0]?.llm_provider ?? null
  },

  async setActive(userId: number, provider: KeyProviderName | null, db: Queryable = getPool()) {
    await db.query('UPDATE users SET llm_provider = $1 WHERE id = $2', [provider, userId])
  }
}
