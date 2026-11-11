const ALLOWED_FIELDS = [
  'role',
  'salary',
  'qualification',
  'skills',
  'experience',
  'location',
  'shortlist_mode',
  'deadline',
  'min_score',
  'criteria_weights'
]

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const updates: Record<string, any> = await readBody(event)
  const pool = usePool()

  // Only allow valid job_roles table columns to be updated
  const fields = Object.keys(updates).filter(f => ALLOWED_FIELDS.includes(f))
  if (fields.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No valid fields provided for update' })
  }

  // Serialize criteria_weights to JSON string for Postgres JSONB column
  if (updates.criteria_weights && typeof updates.criteria_weights === 'object') {
    updates.criteria_weights = JSON.stringify(updates.criteria_weights)
  }

  const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ')
  const values: any[] = fields.map(field => updates[field])
  values.push(id) // For the WHERE clause

  try {
    const result = await pool.query(
      `UPDATE job_roles SET ${setClause} WHERE id = $${values.length} RETURNING *`,
      values
    )
    if (result.rows.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Job role not found' })
    }
    const updatedJob = result.rows[0]

    // Re-embed updated JD into Qdrant
    await upsertJobDescription(updatedJob)

    // Fetch updated job with Google Form information
    const jobWithForm = await pool.query(`
      SELECT jr.*, gf.form_url, gf.form_id as google_form_id
      FROM job_roles jr
      LEFT JOIN (
        SELECT DISTINCT ON (job_role_id) job_role_id, form_url, form_id
        FROM google_forms
        ORDER BY job_role_id, id DESC
      ) gf ON jr.id = gf.job_role_id
      WHERE jr.id = $1
    `, [id])

    return jobWithForm.rows[0] || updatedJob
  } catch (err: any) {
    if (err.statusCode) throw err
    console.error('Error updating job role:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
