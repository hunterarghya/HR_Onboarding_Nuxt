import { getPool, type Queryable } from '~~/server/core/db/pool'
import { ConflictError } from '~~/server/core/errors/app-error'
import type { GoogleFormRow } from '~~/server/database/types'

export interface NewGoogleForm {
  formId: string
  formUrl: string
  formTitle: string
  jobRoleId: number
  questionMap: Record<string, string>
}

export type GoogleFormWithJobRow = GoogleFormRow & { job_role_name: string | null }

export const googleFormsRepository = {
  async findAllWithJobName(db: Queryable = getPool()) {
    const { rows } = await db.query<GoogleFormWithJobRow>(`
      SELECT gf.id, gf.form_id, gf.form_url, gf.form_title, gf.job_role_id,
             gf.question_map, gf.created_at, jr.role as job_role_name
      FROM google_forms gf
      LEFT JOIN job_roles jr ON gf.job_role_id = jr.id
      ORDER BY gf.created_at DESC
    `)
    return rows
  },

  /** Forms to scan: all of them, or only those whose form_id or db id is in `ids`. */
  async findForScan(ids: string[], db: Queryable = getPool()) {
    let query = `
      SELECT gf.*, jr.role as job_role_name
      FROM google_forms gf
      LEFT JOIN job_roles jr ON gf.job_role_id = jr.id
    `
    const params: unknown[] = []
    if (ids.length > 0) {
      query += ` WHERE gf.form_id = ANY($1) OR gf.id::text = ANY($1)`
      params.push(ids)
    }
    const { rows } = await db.query<GoogleFormWithJobRow>(query, params)
    return rows
  },

  async existsForJob(jobRoleId: number, db: Queryable = getPool()) {
    const { rows } = await db.query('SELECT id FROM google_forms WHERE job_role_id = $1', [jobRoleId])
    return rows.length > 0
  },

  /** 409 if the job already has a form: two requests can pass the service's check at once (BUG-13). */
  async insert(form: NewGoogleForm, db: Queryable = getPool()) {
    try {
      await db.query(
        `INSERT INTO google_forms (form_id, form_url, form_title, job_role_id, question_map)
         VALUES ($1, $2, $3, $4, $5)`,
        [form.formId, form.formUrl, form.formTitle, form.jobRoleId, JSON.stringify(form.questionMap)]
      )
    } catch (err) {
      if ((err as { constraint?: string }).constraint === 'google_forms_job_role_unique') {
        throw new ConflictError('A form already exists for this job role')
      }
      throw err
    }
  },

  async deleteByJobId(jobRoleId: number, db: Queryable = getPool()) {
    const { rows } = await db.query<GoogleFormRow>('DELETE FROM google_forms WHERE job_role_id = $1 RETURNING *', [jobRoleId])
    return rows
  },

  async deleteById(id: number, db: Queryable = getPool()) {
    const { rows } = await db.query<GoogleFormRow>('DELETE FROM google_forms WHERE id = $1 RETURNING *', [id])
    return rows
  }
}
