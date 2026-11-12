import { getPool, type Queryable } from '~~/server/core/db/pool'
import type { CandidateRow } from '~~/server/database/types'
import type { ListCandidatesFilters, ListSelectedFilters } from './candidates.dto'

export type SelectedCandidateRow = Pick<CandidateRow,
  'id' | 'name' | 'email' | 'phone' | 'offered_role' | 'offered_salary' | 'offered_location' | 'joining_date' | 'status' | 'offer_sent'>

export interface ResumeCandidateUpdate {
  score: number
  resume_url: string | null
  applied_through: string
  current_location: string
  current_ctc: string
  status: string
}

export interface ResumeCandidateInsert extends ResumeCandidateUpdate {
  name: string
  email: string
  phone: string
  role_applied: string
  resume_content: string
  experience_level: string
}

export interface OfferFields {
  offered_role: unknown
  offered_salary: unknown
  offered_location: unknown
  joining_date: unknown
}

export const candidatesRepository = {
  /**
   * One page of candidates (fetches limit + 1 rows so the caller can tell whether more exist).
   * Cursor: "score|date_applied ISO|id". Newest first, or by score when scoreSort is set.
   */
  async findPage(f: ListCandidatesFilters, db: Queryable = getPool()) {
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

    if (f.cursor) {
      const [cScore, cTime, cId] = f.cursor.split('|')
      const scoreVal = parseInt(cScore!)

      if (f.scoreSort === 'highToLow') {
        q += ` AND (score < $${paramIndex} OR (score = $${paramIndex} AND (date_applied < $${paramIndex + 1} OR (date_applied = $${paramIndex + 1} AND id < $${paramIndex + 2}))))`
        params.push(scoreVal, cTime, cId)
        paramIndex += 3
      } else if (f.scoreSort === 'lowToHigh') {
        q += ` AND (score > $${paramIndex} OR (score = $${paramIndex} AND (date_applied < $${paramIndex + 1} OR (date_applied = $${paramIndex + 1} AND id < $${paramIndex + 2}))))`
        params.push(scoreVal, cTime, cId)
        paramIndex += 3
      } else {
        q += ` AND (date_applied < $${paramIndex} OR (date_applied = $${paramIndex} AND id < $${paramIndex + 1}))`
        params.push(cTime, cId)
        paramIndex += 2
      }
    }

    let orderBy = 'ORDER BY date_applied DESC, id DESC'
    if (f.scoreSort === 'highToLow') orderBy = 'ORDER BY score DESC, date_applied DESC, id DESC'
    else if (f.scoreSort === 'lowToHigh') orderBy = 'ORDER BY score ASC, date_applied DESC, id DESC'

    q += ` ${orderBy} LIMIT $${paramIndex}`
    params.push(f.limit + 1)

    const { rows } = await db.query<CandidateRow>(q, params)
    return rows
  },

  /** One page of selected candidates by joining date (limit + 1 rows). Cursor: "YYYY-MM-DD|id". */
  async findSelectedPage(f: ListSelectedFilters, db: Queryable = getPool()) {
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

    if (f.cursor) {
      const [cDate, cId] = f.cursor.split('|')
      q += ` AND (joining_date > $${paramIndex} OR (joining_date = $${paramIndex} AND id > $${paramIndex + 1}))`
      params.push(cDate, cId)
      paramIndex += 2
    }

    q += ` ORDER BY joining_date ASC, id ASC LIMIT $${paramIndex}`
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

  async findEligibleForRole(role: string, db: Queryable = getPool()) {
    const { rows } = await db.query<CandidateRow>(
      `SELECT * FROM candidates WHERE role_applied = $1 AND status IN ('shortlisted', 'applied', 'marked') ORDER BY score DESC`,
      [role]
    )
    return rows
  },

  /** For "Open Role" events: eligible candidates whose role isn't one of `activeRoles`. */
  async findEligibleOutsideRoles(activeRoles: string[], db: Queryable = getPool()) {
    if (activeRoles.length === 0) {
      const { rows } = await db.query<CandidateRow>(
        `SELECT * FROM candidates WHERE status IN ('shortlisted', 'applied', 'marked') ORDER BY score DESC`
      )
      return rows
    }
    const placeholders = activeRoles.map((_, i) => `$${i + 1}`).join(',')
    const { rows } = await db.query<CandidateRow>(
      `SELECT * FROM candidates
           WHERE status IN ('shortlisted', 'applied', 'marked')
             AND (role_applied IS NULL OR role_applied NOT IN (${placeholders}))
           ORDER BY score DESC`,
      activeRoles
    )
    return rows
  },

  /** Ids and scores of a role's eligible candidates, best first. */
  async findEligibleIdsForRole(role: string, db: Queryable = getPool()) {
    const { rows } = await db.query<{ id: number, score: number | null }>(
      `SELECT id, score FROM candidates
       WHERE role_applied = $1
         AND status IN ('shortlisted', 'applied', 'marked')
       ORDER BY score DESC`,
      [role]
    )
    return rows
  },

  /** Top `limit` eligible candidate ids for a role, skipping `excludeIds`. */
  async topEligibleIdsForRole(role: string, excludeIds: number[], limit: number, db: Queryable = getPool()) {
    let query = `
        SELECT id FROM candidates
        WHERE role_applied = $1
          AND status IN ('shortlisted', 'applied', 'marked')`
    const params: unknown[] = [role]
    let paramIdx = 2

    if (excludeIds.length > 0) {
      query += ` AND id != ALL($${paramIdx}::int[])`
      params.push(excludeIds)
      paramIdx++
    }
    query += ` ORDER BY score DESC LIMIT $${paramIdx}`
    params.push(limit)

    const { rows } = await db.query<{ id: number }>(query, params)
    return rows.map(r => r.id)
  },

  /**
   * "Open Role" variant: candidates whose role isn't one of `activeRoles`.
   * With no active roles this builds `NOT IN ()` and fails (BUG-05, kept until the behaviour-fix phase).
   */
  async topEligibleIdsOutsideRoles(activeRoles: string[], excludeIds: number[], limit: number, db: Queryable = getPool()) {
    let query = `
        SELECT id FROM candidates
        WHERE status IN ('shortlisted', 'applied', 'marked')
          AND (role_applied IS NULL OR role_applied NOT IN (${activeRoles.map((_, i) => `$${i + 1}`).join(',')}))`
    const params: unknown[] = [...activeRoles]
    let paramIdx = activeRoles.length + 1

    if (excludeIds.length > 0) {
      query += ` AND id != ALL($${paramIdx}::int[])`
      params.push(excludeIds)
      paramIdx++
    }
    query += ` ORDER BY score DESC LIMIT $${paramIdx}`
    params.push(limit)

    const { rows } = await db.query<{ id: number }>(query, params)
    return rows.map(r => r.id)
  },

  // ---- Resume intake (ingestion pipeline)

  /** Same person for the same role = same email + role_applied ('N/A' emails collide: DATA-01). */
  async findIdByEmailAndRole(email: string, role: string, db: Queryable = getPool()) {
    const { rows } = await db.query<{ id: number }>('SELECT id FROM candidates WHERE email = $1 AND role_applied = $2', [email, role])
    return rows[0]?.id ?? null
  },

  async updateFromResume(id: number, c: ResumeCandidateUpdate, db: Queryable = getPool()) {
    await db.query(
      `UPDATE candidates SET score = $1, date_applied = NOW(), resume_url = $2, applied_through = $3, current_location = $4, current_ctc = $5, status = $6 WHERE id = $7`,
      [c.score, c.resume_url, c.applied_through, c.current_location, c.current_ctc, c.status, id]
    )
  },

  async insertFromResume(c: ResumeCandidateInsert, db: Queryable = getPool()) {
    await db.query(
      `INSERT INTO candidates (name, email, phone, role_applied, resume_content, score, experience_level, status, resume_url, applied_through, current_location, current_ctc)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [c.name, c.email, c.phone, c.role_applied, c.resume_content, c.score, c.experience_level, c.status, c.resume_url, c.applied_through, c.current_location, c.current_ctc]
    )
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

  async updateStatus(id: number, status: unknown, db: Queryable = getPool()) {
    await db.query('UPDATE candidates SET status = $1 WHERE id = $2', [status, id])
  },

  async updateStatusWithOffer(id: number, status: unknown, offer: OfferFields, db: Queryable = getPool()) {
    await db.query(
      'UPDATE candidates SET status = $1, offered_role = $2, offered_salary = $3, offered_location = $4, joining_date = $5 WHERE id = $6',
      [status, offer.offered_role, offer.offered_salary, offer.offered_location, offer.joining_date, id]
    )
  }
}
