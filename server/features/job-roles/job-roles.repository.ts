import { getPool, type Queryable } from '~~/server/core/db/pool'
import type { JobRoleRow, JobRoleWithFormRow } from '~~/server/database/types'
import type { CreateJobRoleInput, UpdateJobRoleInput } from './job-roles.dto'

/** Columns a PATCH may change; anything else in the body is ignored. */
export const UPDATABLE_FIELDS = [
  'role',
  'salary_min',
  'salary_max',
  'qualification',
  'skills',
  'experience_min_years',
  'location',
  'shortlist_mode',
  'deadline',
  'min_score',
  'criteria_weights'
] as const

export const jobRolesRepository = {
  /** Every job with its most recent Google Form, newest job first. */
  async findAllWithLatestForm(db: Queryable = getPool()) {
    const { rows } = await db.query<JobRoleWithFormRow>(`
      SELECT jr.*, gf.form_url, gf.form_id as google_form_id, gf.id as google_form_db_id
      FROM job_roles jr
      LEFT JOIN (
        SELECT DISTINCT ON (job_role_id) id, job_role_id, form_url, form_id
        FROM google_forms
        ORDER BY job_role_id, id DESC
      ) gf ON jr.id = gf.job_role_id
      ORDER BY jr.created_at DESC
    `)
    return rows
  },

  async findByIdWithLatestForm(id: number, db: Queryable = getPool()) {
    const { rows } = await db.query<JobRoleWithFormRow>(`
      SELECT jr.*, gf.form_url, gf.form_id as google_form_id
      FROM job_roles jr
      LEFT JOIN (
        SELECT DISTINCT ON (job_role_id) job_role_id, form_url, form_id
        FROM google_forms
        ORDER BY job_role_id, id DESC
      ) gf ON jr.id = gf.job_role_id
      WHERE jr.id = $1
    `, [id])
    return rows[0] ?? null
  },

  async findById(id: number, db: Queryable = getPool()) {
    const { rows } = await db.query<JobRoleRow>('SELECT * FROM job_roles WHERE id = $1', [id])
    return rows[0] ?? null
  },

  async findAll(db: Queryable = getPool()) {
    const { rows } = await db.query<JobRoleRow>('SELECT * FROM job_roles')
    return rows
  },

  async listRoleNames(db: Queryable = getPool()) {
    const { rows } = await db.query<{ role: string }>('SELECT role FROM job_roles')
    return rows.map(r => r.role)
  },

  async insert(input: CreateJobRoleInput, db: Queryable = getPool()) {
    const { rows } = await db.query<JobRoleRow>(
      `INSERT INTO job_roles (role, salary_min, salary_max, qualification, skills, experience_min_years, location, shortlist_mode, deadline, min_score, criteria_weights)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      // defaults (manual, 60, {}) come from the DTO; ?? keeps a legitimate min_score of 0 (BUG-03)
      [input.role, input.salary_min, input.salary_max, input.qualification, input.skills, input.experience_min_years, input.location,
        input.shortlist_mode, input.deadline, input.min_score, JSON.stringify(input.criteria_weights)]
    )
    return rows[0]!
  },

  /** Updates only the given allowed columns; null if the job doesn't exist. */
  async update(id: number, patch: UpdateJobRoleInput, fields: readonly string[], db: Queryable = getPool()) {
    const values = fields.map((field) => {
      const value = patch[field as keyof UpdateJobRoleInput]
      // JSONB column: send objects as JSON text
      return field === 'criteria_weights' && value && typeof value === 'object' ? JSON.stringify(value) : value
    })
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ')
    const { rows } = await db.query<JobRoleRow>(
      `UPDATE job_roles SET ${setClause} WHERE id = $${values.length + 1} RETURNING *`,
      [...values, id]
    )
    return rows[0] ?? null
  },

  async delete(id: number, db: Queryable = getPool()) {
    await db.query('DELETE FROM job_roles WHERE id = $1', [id])
  }
}
