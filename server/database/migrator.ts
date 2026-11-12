import type pg from 'pg'

export interface Migration {
  /** File name; migrations run in name order, so names start with a zero-padded number. */
  name: string
  sql: string
}

// Arbitrary constant: only one process at a time may migrate (web and worker can boot together).
const MIGRATION_LOCK_ID = 7_203_118_401

/**
 * Applies the migrations not yet recorded in schema_migrations, in name order, each in its own
 * transaction. Forward-only: a change is undone by a new migration. Returns the names it applied.
 */
export const runMigrations = async (pool: pg.Pool, migrations: Migration[]): Promise<string[]> => {
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID])
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations')
    const applied = new Set(rows.map(r => r.name))
    const ran: string[] = []

    for (const migration of [...migrations].sort((a, b) => a.name.localeCompare(b.name))) {
      if (applied.has(migration.name)) continue
      try {
        await client.query('BEGIN')
        await client.query(migration.sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name])
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw new Error(`Migration ${migration.name} failed: ${(err as Error).message}`, { cause: err })
      }
      ran.push(migration.name)
    }
    return ran
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {})
    client.release()
  }
}
