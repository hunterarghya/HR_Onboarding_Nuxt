import { getPool, type Queryable } from '~~/server/core/db/pool'
import type { CandidateRow } from '~~/server/database/types'

export type AssignedCandidateRow = CandidateRow & { assigned_at: Date, invite_sent: boolean }
export type UninvitedCandidateRow = CandidateRow & { ic_id: number }

export const interviewAssignmentsRepository = {
  /** Candidates assigned to an event, best score first, with assignment columns. */
  async listForEvent(eventId: number, db: Queryable = getPool()) {
    const { rows } = await db.query<AssignedCandidateRow>(
      `SELECT c.*, ic.assigned_at, ic.invite_sent
       FROM interview_candidates ic
       JOIN candidates c ON c.id = ic.candidate_id
       WHERE ic.event_id = $1
       ORDER BY c.score DESC`,
      [eventId]
    )
    return rows
  },

  /** Assigned candidates of an event that haven't been invited yet (ic_id = assignment row id). */
  async listUninvitedForEvent(eventId: number, db: Queryable = getPool()) {
    const { rows } = await db.query<UninvitedCandidateRow>(
      `SELECT c.*, ic.id as ic_id
       FROM interview_candidates ic
       JOIN candidates c ON c.id = ic.candidate_id
       WHERE ic.event_id = $1 AND ic.invite_sent = false`,
      [eventId]
    )
    return rows
  },

  /** Candidates already placed in another event for the same job (null: another Open Role event). */
  async candidateIdsInOtherEventsOfJob(jobRoleId: number | null, eventId: number, db: Queryable = getPool()) {
    const { rows } = await db.query<{ candidate_id: number }>(
      `SELECT ic.candidate_id FROM interview_candidates ic
       JOIN interview_events ie ON ie.id = ic.event_id
       WHERE ie.job_role_id IS NOT DISTINCT FROM $1 AND ic.event_id != $2`,
      [jobRoleId, eventId]
    )
    return rows.map(r => r.candidate_id)
  },

  /**
   * Makes the event's list exactly `candidateIds`: people taken off are removed, new people are added, and
   * everyone who stays keeps their row, so an invite already sent isn't sent again (BUG-04).
   * Run it in a transaction so the list never shows half-changed.
   */
  async replaceForEvent(eventId: number, candidateIds: number[], db: Queryable = getPool()) {
    await db.query('DELETE FROM interview_candidates WHERE event_id = $1 AND candidate_id != ALL($2::int[])', [eventId, candidateIds])
    await db.query(
      `INSERT INTO interview_candidates (event_id, candidate_id)
       SELECT $1, unnest($2::int[])
       ON CONFLICT (event_id, candidate_id) DO NOTHING`,
      [eventId, candidateIds]
    )
  },

  async markInviteSent(assignmentId: number, db: Queryable = getPool()) {
    await db.query('UPDATE interview_candidates SET invite_sent = true WHERE id = $1', [assignmentId])
  }
}
