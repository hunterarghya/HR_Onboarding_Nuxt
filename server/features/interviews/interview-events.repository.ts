import { getPool, type Queryable } from '~~/server/core/db/pool'
import type { InterviewEventRow } from '~~/server/database/types'

export interface NewInterviewEvent {
  job_role_id: number | null
  role: string
  event_date: string
  start_time: string
  end_time: string
  num_candidates: number
  extra_candidates: number
  interview_mode: string
  venue_or_link: string | null
  google_event_id: string | null
}

export const interviewEventsRepository = {
  async findAll(db: Queryable = getPool()) {
    const { rows } = await db.query<InterviewEventRow>('SELECT * FROM interview_events ORDER BY event_date ASC, start_time ASC')
    return rows
  },

  async findById(id: number, db: Queryable = getPool()) {
    const { rows } = await db.query<InterviewEventRow>('SELECT * FROM interview_events WHERE id = $1', [id])
    return rows[0] ?? null
  },

  /** A job's events (null: the Open Role events), soonest first. */
  async findByJob(jobRoleId: number | null, db: Queryable = getPool()) {
    const { rows } = await db.query<InterviewEventRow>(
      `SELECT * FROM interview_events WHERE job_role_id IS NOT DISTINCT FROM $1 ORDER BY event_date ASC, start_time ASC`,
      [jobRoleId]
    )
    return rows
  },

  /** Events that came from (or were pushed to) Google Calendar. */
  async findLinkedToGoogle(db: Queryable = getPool()) {
    const { rows } = await db.query<{ id: number, google_event_id: string }>(
      'SELECT id, google_event_id FROM interview_events WHERE google_event_id IS NOT NULL'
    )
    return rows
  },

  async insert(e: NewInterviewEvent, db: Queryable = getPool()) {
    const { rows } = await db.query<InterviewEventRow>(
      `INSERT INTO interview_events (job_role_id, role, event_date, start_time, end_time, num_candidates, extra_candidates, interview_mode, venue_or_link, google_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [e.job_role_id, e.role, e.event_date, e.start_time, e.end_time, e.num_candidates, e.extra_candidates, e.interview_mode, e.venue_or_link, e.google_event_id]
    )
    return rows[0]!
  },

  /** Insert used by calendar sync; a conflicting row is skipped. */
  async insertImported(e: NewInterviewEvent, db: Queryable = getPool()) {
    await db.query(
      `INSERT INTO interview_events (job_role_id, role, event_date, start_time, end_time, num_candidates, extra_candidates, interview_mode, venue_or_link, google_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT DO NOTHING`,
      [e.job_role_id, e.role, e.event_date, e.start_time, e.end_time, e.num_candidates, e.extra_candidates, e.interview_mode, e.venue_or_link, e.google_event_id]
    )
  },

  /** Deleting an event also deletes its candidate assignments (ON DELETE CASCADE). */
  async deleteById(id: number, db: Queryable = getPool()) {
    await db.query('DELETE FROM interview_events WHERE id = $1', [id])
  },

  /** Ids of events that still have at least one uninvited candidate. */
  async findIdsWithUnsentInvites(db: Queryable = getPool()) {
    const { rows } = await db.query<{ id: number }>(
      `SELECT DISTINCT ie.id FROM interview_events ie
       JOIN interview_candidates ic ON ic.event_id = ie.id
       WHERE ic.invite_sent = false`
    )
    return rows.map(r => r.id)
  },

  /** Per event: how many assigned candidates haven't been invited yet (COUNTs come back as strings). */
  async unsentInviteCounts(db: Queryable = getPool()) {
    const { rows } = await db.query<{ event_id: number, event_date: string, unsent_count: string, total_count: string }>(
      `SELECT ie.id as event_id, ie.event_date,
              COUNT(ic.id) FILTER (WHERE ic.invite_sent = false) as unsent_count,
              COUNT(ic.id) as total_count
       FROM interview_events ie
       JOIN interview_candidates ic ON ic.event_id = ie.id
       GROUP BY ie.id, ie.event_date
       HAVING COUNT(ic.id) FILTER (WHERE ic.invite_sent = false) > 0`
    )
    return rows
  }
}
