export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  const pool = usePool()

  try {
    const eventResult = await pool.query('SELECT role FROM interview_events WHERE id = $1', [eventId])
    if (eventResult.rows.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Event not found' })
    }

    const role = eventResult.rows[0].role
    let result

    if (role === 'Open Role') {
      const activeRolesResult = await pool.query('SELECT role FROM job_roles')
      const activeRolesList = activeRolesResult.rows.map((r: any) => r.role)

      if (activeRolesList.length > 0) {
        const placeholders = activeRolesList.map((_: any, i: number) => `$${i + 1}`).join(',')
        result = await pool.query(
          `SELECT * FROM candidates 
           WHERE status IN ('shortlisted', 'applied', 'marked')
             AND (role_applied IS NULL OR role_applied NOT IN (${placeholders}))
           ORDER BY score DESC`,
          activeRolesList
        )
      } else {
        result = await pool.query(
          `SELECT * FROM candidates WHERE status IN ('shortlisted', 'applied', 'marked') ORDER BY score DESC`
        )
      }
    } else {
      result = await pool.query(
        `SELECT * FROM candidates WHERE role_applied = $1 AND status IN ('shortlisted', 'applied', 'marked') ORDER BY score DESC`,
        [role]
      )
    }

    return result.rows
  } catch (err: any) {
    if (err.statusCode) throw err
    console.error('Error fetching eligible candidates:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
