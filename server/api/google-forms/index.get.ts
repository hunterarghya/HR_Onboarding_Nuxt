export default defineEventHandler(async () => {
  const pool = usePool()

  const result = await pool.query(`
    SELECT gf.id, gf.form_id, gf.form_url, gf.form_title, gf.job_role_id,
           gf.question_map, gf.created_at, jr.role as job_role_name
    FROM google_forms gf
    LEFT JOIN job_roles jr ON gf.job_role_id = jr.id
    ORDER BY gf.created_at DESC
  `)

  return result.rows
})
