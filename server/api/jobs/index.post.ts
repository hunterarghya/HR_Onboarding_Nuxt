export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { role, salary, qualification, skills, experience, location, shortlist_mode, deadline, min_score, criteria_weights } = body
  const pool = usePool()

  try {
    const result = await pool.query(
      'INSERT INTO job_roles (role, salary, qualification, skills, experience, location, shortlist_mode, deadline, min_score, criteria_weights) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [role, salary, qualification, skills, experience, location, shortlist_mode || 'manual', deadline, min_score || 60, JSON.stringify(criteria_weights || {})]
    )
    const newJob = result.rows[0]

    // Embed the new JD into Qdrant
    await upsertJobDescription(newJob)

    setResponseStatus(event, 201)
    return newJob
  } catch (err) {
    console.error('Error creating job role:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
