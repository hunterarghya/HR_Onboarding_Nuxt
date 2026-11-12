import { getPool, type Queryable } from '~~/server/core/db/pool'

export interface CalendarChannelRow {
  id: number
  user_id: number
  channel_id: string
  resource_id: string
  token_hash: string
  expires_at: Date
  created_at: Date
}

export const calendarChannelsRepository = {
  async insert(c: Pick<CalendarChannelRow, 'user_id' | 'channel_id' | 'resource_id' | 'token_hash' | 'expires_at'>, db: Queryable = getPool()) {
    const { rows } = await db.query<CalendarChannelRow>(
      `INSERT INTO calendar_channels (user_id, channel_id, resource_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [c.user_id, c.channel_id, c.resource_id, c.token_hash, c.expires_at]
    )
    return rows[0]!
  },

  async findByChannelId(channelId: string, db: Queryable = getPool()) {
    const { rows } = await db.query<CalendarChannelRow>('SELECT * FROM calendar_channels WHERE channel_id = $1', [channelId])
    return rows[0] ?? null
  },

  /** A user's channels other than `keepChannelId`. */
  async findOthersForUser(userId: number, keepChannelId: string, db: Queryable = getPool()) {
    const { rows } = await db.query<CalendarChannelRow>(
      'SELECT * FROM calendar_channels WHERE user_id = $1 AND channel_id <> $2', [userId, keepChannelId]
    )
    return rows
  },

  /** Channels that expire before `before` (to renew). */
  async findExpiringBefore(before: Date, db: Queryable = getPool()) {
    const { rows } = await db.query<CalendarChannelRow>('SELECT * FROM calendar_channels WHERE expires_at < $1 ORDER BY expires_at', [before])
    return rows
  },

  async deleteById(id: number, db: Queryable = getPool()) {
    await db.query('DELETE FROM calendar_channels WHERE id = $1', [id])
  }
}
