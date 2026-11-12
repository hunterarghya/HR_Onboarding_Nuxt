import { getPool, type Queryable } from '~~/server/core/db/pool'
import type { CandidateRow, CandidateStatus } from '~~/server/database/types'
import type { CandidatesPosition, ListCandidatesFilters, ListSelectedFilters, SelectedPosition } from './candidates.dto'

export type SelectedCandidateRow = Pick<CandidateRow,
  'id' | 'name' | 'email' | 'phone' | 'offered_role' | 'offered_salary' | 'offered_location' | 'joining_date' | 'status' | 'offer_sent'>

/** A candidate as read from a resume. Unknown details are null, never "N/A" (DATA-04). */
export interface ResumeCandidate {
  score: number
  resume_url: string | null
  applied_through: string
  current_location: string | null
  current_ctc: number | null
  status: CandidateStatus
  name: string
  email: string | null
  phone: string | null
  job_role_id: number | null
  role_applied: string
  resume_content: string
  experience_years: number | null
}

export interface OfferFields {
  offered_role: string
  offered_salary: number
  offered_location: string
  joining_date: string
}

export const candidatesRepository = {
  /** Which of these ids exist. */
  async existingIds(ids: number[], db: Queryable = getPool()) {
    if (ids.length === 0) return []
    const { rows } = await db.query<{ id: number }>('SELECT id FROM candidates WHERE id = ANY($1::int[])', [ids])
    return rows.map(r => r.id)
  },

  /**
   * One page of candidates after `after` (fetches limit + 1 rows so the caller can tell whether more exist).
   * Newest first, or by score when scoreSort is set; unscored candidates sort as the lowest score (BUG-08).
   * Times are compared to the millisecond, the precision the cursor carries.
   */
  async findPage(f: ListCandidatesFilters, after: CandidatesPosition | null, db: Queryable = getPool()) {
    let q = 'SELECT * FROM candidates WHERE 1=1'
    const params: unknown[] = []
    let paramIndex = 1

    if (f.role) {
      q += ` AND role_applied = $${paramIndex++}`
      params.push(f.role)
    }
    if (f.status) {
      q += ` AND status = $${paramIndex++}`
      params.push(f.status)
    }
    if (f.source) {
      q += ` AND applied_through = $${paramIndex++}`
      params.push(f.source)
    }
    if (f.name) {
      q += ` AND name ILIKE $${paramIndex++}`
      params.push(`%${f.name}%`)
    }
    if (f.minScore !== undefined && f.minScore !== '') {
      q += ` AND score >= $${paramIndex++}`
      params.push(f.minScore)
    }
    if (f.maxScore !== undefined && f.maxScore !== '') {
      q += ` AND score <= $${paramIndex++}`
      params.push(f.maxScore)
    }

    const SCORE = 'COALESCE(score, -1)'
    const AT = `date_trunc('milliseconds', date_applied)`

    if (after) {
      const at = `$${paramIndex}::timestamptz`, id = `$${paramIndex + 1}::int`, s = `$${paramIndex + 2}::int`
      const newerTie = `(${AT} < ${at} OR (${AT} = ${at} AND id < ${id}))`
      params.push(after.at, after.id)
      paramIndex += 2
      if (f.scoreSort === 'newest') q += ` AND ${newerTie}`
      else {
        const beyond = f.scoreSort === 'highToLow' ? '<' : '>'
        q += ` AND (${SCORE} ${beyond} ${s} OR (${SCORE} = ${s} AND ${newerTie}))`
        params.push(after.score ?? -1)
        paramIndex += 1
      }
    }

    let orderBy = `ORDER BY ${AT} DESC, id DESC`
    if (f.scoreSort === 'highToLow') orderBy = `ORDER BY ${SCORE} DESC, ${AT} DESC, id DESC`
    else if (f.scoreSort === 'lowToHigh') orderBy = `ORDER BY ${SCORE} ASC, ${AT} DESC, id DESC`

    q += ` ${orderBy} LIMIT $${paramIndex}`
    params.push(f.limit + 1)

    const { rows } = await db.query<CandidateRow>(q, params)
    return rows
  },

  /** One page of selected candidates by joining date after `after` (limit + 1 rows); no date yet sorts last. */
  async findSelectedPage(f: ListSelectedFilters, after: SelectedPosition | null, db: Queryable = getPool()) {
    let q = 'SELECT id, name, email, phone, offered_role, offered_salary, offered_location, joining_date, status, offer_sent FROM candidates WHERE status = $1'
    const params: unknown[] = ['selected']
    let paramIndex = 2

    if (f.offered_role) {
      q += ` AND offered_role = $${paramIndex++}`
      params.push(f.offered_role)
    }
    if (f.offered_location) {
      q += ` AND offered_location = $${paramIndex++}`
      params.push(f.offered_location)
    }
    if (f.dateFrom) {
      q += ` AND joining_date >= $${paramIndex++}`
      params.push(f.dateFrom)
    }
    if (f.dateTo) {
      q += ` AND joining_date <= $${paramIndex++}`
      params.push(f.dateTo)
    }
    if (f.offer_sent !== undefined && f.offer_sent !== '') {
      q += ` AND offer_sent = $${paramIndex++}`
      params.push(f.offer_sent === 'true')
    }

    const DATE = `COALESCE(joining_date, 'infinity'::date)`
    if (after) {
      const d = `COALESCE($${paramIndex}::date, 'infinity'::date)`
      q += ` AND (${DATE} > ${d} OR (${DATE} = ${d} AND id > $${paramIndex + 1}))`
      params.push(after.date, after.id)
      paramIndex += 2
    }

    q += ` ORDER BY ${DATE} ASC, id ASC LIMIT $${paramIndex}`
    params.push(f.limit + 1)

    const { rows } = await db.query<SelectedCandidateRow>(q, params)
    return rows
  },

  async distinctOfferedRoles(db: Queryable = getPool()) {
    const { rows } = await db.query<{ offered_role: string }>('SELECT DISTINCT offered_role FROM candidates WHERE status = $1 AND offered_role IS NOT NULL ORDER BY offered_role', ['selected'])
    return rows.map(r => r.offered_role)
  },

  async distinctOfferedLocations(db: Queryable = getPool()) {
    const { rows } = await db.query<{ offered_location: string }>('SELECT DISTINCT offered_location FROM candidates WHERE status = $1 AND offered_location IS NOT NULL ORDER BY offered_location', ['selected'])
    return rows.map(r => r.offered_location)
  },

  // ---- Interview eligibility: candidates in an open pipeline status ('shortlisted', 'applied', 'marked')

  // A job id of null means the Open pool (and "Open Role" events), which also fixes BUG-05.

  async findEligibleForJob(jobRoleId: number | null, db: Queryable = getPool()) {
    const { rows } = await db.query<CandidateRow>(
      `SELECT * FROM candidates WHERE job_role_id IS NOT DISTINCT FROM $1 AND status IN ('shortlisted', 'applied', 'marked') ORDER BY score DESC NULLS LAST`,
      [jobRoleId]
    )
    return rows
  },

  /** Ids and scores of a job's eligible candidates, best first. */
  async findEligibleIdsForJob(jobRoleId: number | null, db: Queryable = getPool()) {
    const { rows } = await db.query<{ id: number, score: number | null }>(
      `SELECT id, score FROM candidates
       WHERE job_role_id IS NOT DISTINCT FROM $1
         AND status IN ('shortlisted', 'applied', 'marked')
       ORDER BY score DESC NULLS LAST`,
      [jobRoleId]
    )
    return rows
  },

  /** Top `limit` eligible candidate ids for a job, skipping `excludeIds`. */
  async topEligibleIdsForJob(jobRoleId: number | null, excludeIds: number[], limit: number, db: Queryable = getPool()) {
    const { rows } = await db.query<{ id: number }>(
      `SELECT id FROM candidates
       WHERE job_role_id IS NOT DISTINCT FROM $1
         AND status IN ('shortlisted', 'applied', 'marked')
         AND id != ALL($2::int[])
       ORDER BY score DESC NULLS LAST LIMIT $3`,
      [jobRoleId, excludeIds, limit]
    )
    return rows.map(r => r.id)
  },

  // ---- Resume intake (ingestion pipeline)

  /**
   * Saves a resume. The same email applying to the same job again updates that candidate (the unique
   * index candidates_identity makes this safe across parallel scans); without an email there's no way
   * to tell people apart, so every such resume is a new candidate (DATA-01). True if a row was inserted.
   */
  async saveFromResume(c: ResumeCandidate, db: Queryable = getPool()) {
    const values = [c.name, c.email, c.phone, c.job_role_id, c.role_applied, c.resume_content, c.score, c.experience_years, c.status, c.resume_url, c.applied_through, c.current_location, c.current_ctc]
    const insert = `INSERT INTO candidates (name, email, phone, job_role_id, role_applied, resume_content, score, experience_years, status, resume_url, applied_through, current_location, current_ctc)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`
    if (c.email === null) {
      await db.query(insert, values)
      return true
    }
    const { rows } = await db.query<{ inserted: boolean }>(
      `${insert}
       ON CONFLICT (lower(email), job_role_id) WHERE email IS NOT NULL
       DO UPDATE SET score = EXCLUDED.score, date_applied = now(), resume_url = EXCLUDED.resume_url,
         applied_through = EXCLUDED.applied_through, current_location = EXCLUDED.current_location,
         current_ctc = EXCLUDED.current_ctc, status = EXCLUDED.status
       RETURNING (xmax = 0) AS inserted`,
      values
    )
    return rows[0]!.inserted
  },

  // ---- Offer letters

  /** The given candidates that are selected and haven't been sent an offer yet. */
  async findSelectedWithoutOffer(ids: number[], db: Queryable = getPool()) {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',')
    const { rows } = await db.query<CandidateRow>(
      `SELECT * FROM candidates
     WHERE id IN (${placeholders}) AND status = 'selected' AND offer_sent = false`,
      ids
    )
    return rows
  },

  async markOfferSent(id: number, db: Queryable = getPool()) {
    await db.query('UPDATE candidates SET offer_sent = true WHERE id = $1', [id])
  },

  /** False if no such candidate. */
  async updateStatus(id: number, status: CandidateStatus, db: Queryable = getPool()) {
    const { rowCount } = await db.query('UPDATE candidates SET status = $1 WHERE id = $2', [status, id])
    return rowCount === 1
  },

  /** False if no such candidate. */
  async updateStatusWithOffer(id: number, status: CandidateStatus, offer: OfferFields, db: Queryable = getPool()) {
    const { rowCount } = await db.query(
      'UPDATE candidates SET status = $1, offered_role = $2, offered_salary = $3, offered_location = $4, joining_date = $5 WHERE id = $6',
      [status, offer.offered_role, offer.offered_salary, offer.offered_location, offer.joining_date, id]
    )
    return rowCount === 1
  }
}
