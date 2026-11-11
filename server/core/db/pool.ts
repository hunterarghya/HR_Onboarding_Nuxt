import pg from 'pg'
import { config } from '~~/server/config/env'

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
