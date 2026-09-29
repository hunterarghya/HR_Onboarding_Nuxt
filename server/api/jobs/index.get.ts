export default defineEventHandler(async () => {
  const pool = usePool()
  try {
    const result = await pool.query(`
      SELECT jr.*, gf.form_url, gf.form_id as google_form_id
      FROM job_roles jr
      LEFT JOIN (
        SELECT DISTINCT ON (job_role_id) job_role_id, form_url, form_id
        FROM google_forms
        ORDER BY job_role_id, id DESC
      ) gf ON jr.id = gf.job_role_id
      ORDER BY jr.created_at DESC
    `)
    return result.rows
  } catch (err) {
    console.error('Error fetching job roles:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
