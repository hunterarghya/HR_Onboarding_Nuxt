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
   * Replaces an event's assignment list. New rows start with invite_sent = false, so re-assigning
   * resets invite state (BUG-04, kept until the behaviour-fix phase).
   */
  /** Run it in a transaction: the old list is deleted before the new one is written. */
  async replaceForEvent(eventId: number, candidateIds: number[], db: Queryable = getPool()) {
    await db.query('DELETE FROM interview_candidates WHERE event_id = $1', [eventId])
    if (candidateIds.length === 0) return

    const values = candidateIds.map((_, i) => `($1, $${i + 2})`).join(', ')
    await db.query(
      `INSERT INTO interview_candidates (event_id, candidate_id) VALUES ${values}
       ON CONFLICT (event_id, candidate_id) DO NOTHING`,
      [eventId, ...candidateIds]
    )
  },

  async markInviteSent(assignmentId: number, db: Queryable = getPool()) {
    await db.query('UPDATE interview_candidates SET invite_sent = true WHERE id = $1', [assignmentId])
  }
}
