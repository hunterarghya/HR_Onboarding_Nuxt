import { getPool, type Queryable } from '~~/server/core/db/pool'

export interface UserRow {
  id: number
  email: string
  name: string | null
  created_at: Date
  last_login_at: Date | null
}

export const usersRepository = {
  /** Creates the user on first sign-in; afterwards refreshes the name and last login time. */
  async upsertOnLogin(email: string, name: string | null, db: Queryable = getPool()) {
    const { rows } = await db.query<UserRow>(
      `INSERT INTO users (email, name, last_login_at) VALUES ($1, $2, now())
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, last_login_at = now()
       RETURNING *`,
      [email, name]
    )
    return rows[0]!
  },

  async findById(id: number, db: Queryable = getPool()) {
    const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id])
    return rows[0] ?? null
  }
}
