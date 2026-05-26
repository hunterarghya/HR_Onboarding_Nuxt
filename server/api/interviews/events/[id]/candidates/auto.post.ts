export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const pool = usePool()

  try {
    const eventResult = await pool.query('SELECT * FROM interview_events WHERE id = $1', [id])
    if (eventResult.rows.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Event not found' })
    }

    const evt = eventResult.rows[0]
    const totalSlots = evt.num_candidates + (evt.extra_candidates || 0)

    const alreadyAssigned = await pool.query(
      `SELECT ic.candidate_id FROM interview_candidates ic
       JOIN interview_events ie ON ie.id = ic.event_id
       WHERE ie.role = $1 AND ic.event_id != $2`,
      [evt.role, id]
    )
    const excludeIds = alreadyAssigned.rows.map((r: any) => r.candidate_id)

    let query: string
    let params: any[]

    if (evt.role === 'Open Role') {
      const activeRolesResult = await pool.query('SELECT role FROM job_roles')
      const activeRolesList = activeRolesResult.rows.map((r: any) => r.role)

      query = `
        SELECT id FROM candidates
        WHERE status IN ('shortlisted', 'applied', 'marked')
          AND (role_applied IS NULL OR role_applied NOT IN (${activeRolesList.map((_: any, i: number) => `$${i + 1}`).join(',')}))`
      params = [...activeRolesList]
      let paramIdx = activeRolesList.length + 1

      if (excludeIds.length > 0) {
        query += ` AND id != ALL($${paramIdx}::int[])`
        params.push(excludeIds)
        paramIdx++
      }
      query += ` ORDER BY score DESC LIMIT $${paramIdx}`
      params.push(totalSlots)
    } else {
      query = `
        SELECT id FROM candidates
        WHERE role_applied = $1
          AND status IN ('shortlisted', 'applied', 'marked')`
      params = [evt.role]
      let paramIdx = 2

      if (excludeIds.length > 0) {
        query += ` AND id != ALL($${paramIdx}::int[])`
        params.push(excludeIds)
        paramIdx++
      }
      query += ` ORDER BY score DESC LIMIT $${paramIdx}`
      params.push(totalSlots)
    }

    const candidatesResult = await pool.query(query, params)
    const candidateIds = candidatesResult.rows.map((r: any) => r.id)

    if (candidateIds.length === 0) {
      return { message: 'No eligible candidates found', count: 0 }
    }

    await pool.query('DELETE FROM interview_candidates WHERE event_id = $1', [id])

    const values = candidateIds.map((_: any, i: number) => `($1, $${i + 2})`).join(', ')
    const insertParams = [id, ...candidateIds]

    await pool.query(
      `INSERT INTO interview_candidates (event_id, candidate_id) VALUES ${values}
       ON CONFLICT (event_id, candidate_id) DO NOTHING`,
      insertParams
    )

    return { message: 'Candidates auto-assigned successfully', count: candidateIds.length }
  } catch (err: any) {
    if (err.statusCode) throw err
    console.error('Error auto-assigning candidates:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
