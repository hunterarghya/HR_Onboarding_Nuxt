import { getPool, type Queryable } from '~~/server/core/db/pool'
import type { ScanTimestampRow } from '~~/server/database/types'
import type { ScanSource } from './ingestion.types'

// "Watermarks": when each source (and each WhatsApp group / form) was last scanned.

export const scanStateRepository = {
  async getWatermark(sourceType: ScanSource, sourceId = 'default', db: Queryable = getPool()) {
    const { rows } = await db.query<Pick<ScanTimestampRow, 'last_scanned_at'>>(
      'SELECT last_scanned_at FROM scan_timestamps WHERE source_type = $1 AND source_id = $2',
      [sourceType, sourceId]
    )
    return rows.length > 0 ? new Date(rows[0]!.last_scanned_at) : null
  },

  async setWatermark(sourceType: ScanSource, sourceId = 'default', timestamp = new Date(), db: Queryable = getPool()) {
    await db.query(
      `INSERT INTO scan_timestamps (source_type, source_id, last_scanned_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (source_type, source_id)
     DO UPDATE SET last_scanned_at = $3`,
      [sourceType, sourceId, timestamp]
    )
  },

  async removeWatermark(sourceType: ScanSource, sourceId: string, db: Queryable = getPool()) {
    await db.query('DELETE FROM scan_timestamps WHERE source_type = $1 AND source_id = $2', [sourceType, sourceId])
  },

  /** All watermarks, newest first. */
  async findAll(db: Queryable = getPool()) {
    const { rows } = await db.query<Pick<ScanTimestampRow, 'source_type' | 'source_id' | 'last_scanned_at'>>(
      `SELECT source_type, source_id, last_scanned_at FROM scan_timestamps ORDER BY last_scanned_at DESC`
    )
    return rows
  }
}
