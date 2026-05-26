export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const updates: Record<string, any> = await readBody(event)
  const pool = usePool()

  const fields = Object.keys(updates)
  if (fields.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields provided' })
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
    const updatedJob = result.rows[0]

    // Re-embed updated JD into Qdrant
    await upsertJobDescription(updatedJob)

    return updatedJob
  } catch (err) {
    console.error('Error updating job role:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
