import type pg from 'pg'
import { getPool } from './pool'

/** Runs `work` in a transaction: commits if it resolves, rolls back if it throws. */
export const withTransaction = async <T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
