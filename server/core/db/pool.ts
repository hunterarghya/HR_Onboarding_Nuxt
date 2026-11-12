import pg from 'pg'
import { config } from '~~/server/config/env'

// NUMERIC columns (salaries, CTC, years of experience) come back as numbers, not strings.
// They're far below 2^53, so nothing is lost. COUNT(*) (BIGINT) is left as a string.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, value => parseFloat(value))

let pool: pg.Pool | null = null

/** Anything that can run a query: the pool itself, or a client inside a transaction. */
export type Queryable = Pick<pg.Pool, 'query'>

export const getPool = (): pg.Pool => {
  if (!pool) pool = new pg.Pool({ connectionString: config.db.url })
  return pool
}

export const closePool = async (): Promise<void> => {
  if (!pool) return
  const closing = pool
  pool = null
  await closing.end()
}

/** Throws if the database can't answer a trivial query. */
export const pingDatabase = async (): Promise<void> => {
  await getPool().query('SELECT 1')
}
