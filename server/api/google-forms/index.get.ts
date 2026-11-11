import jwt from 'jsonwebtoken'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'secret')
  } catch {
    throw createError({ statusCode: 403, statusMessage: 'Invalid token' })
  }

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
