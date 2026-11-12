import { getPool, type Queryable } from '~~/server/core/db/pool'
import type { EmailTemplateRow } from '~~/server/database/types'

export interface TemplateFields {
  name: string
  subject: string
  body: string
  type: string
}

export const templatesRepository = {
  async findAll(db: Queryable = getPool()) {
    const { rows } = await db.query<EmailTemplateRow>('SELECT * FROM email_templates ORDER BY type ASC, is_default DESC, name ASC')
    return rows
  },

  async findById(id: number, db: Queryable = getPool()) {
    const { rows } = await db.query<EmailTemplateRow>('SELECT * FROM email_templates WHERE id = $1', [id])
    return rows[0] ?? null
  },

  async insert(t: TemplateFields, db: Queryable = getPool()) {
    const { rows } = await db.query<EmailTemplateRow>(
      `INSERT INTO email_templates (name, subject, body, type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [t.name, t.subject, t.body, t.type]
    )
    return rows[0]!
  },

  async update(id: number, t: TemplateFields, db: Queryable = getPool()) {
    const { rows } = await db.query<EmailTemplateRow>(
      `UPDATE email_templates SET name = $1, subject = $2, body = $3, type = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 RETURNING *`,
      [t.name, t.subject, t.body, t.type, id]
    )
    return rows[0] ?? null
  },

  /** True if a row was deleted. */
  async delete(id: number, db: Queryable = getPool()) {
    const { rows } = await db.query('DELETE FROM email_templates WHERE id = $1 RETURNING id', [id])
    return rows.length > 0
  }
}
