export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { role } = body
  const pool = usePool()

  if (!role) {
    throw createError({ statusCode: 400, statusMessage: 'role is required' })
  }

  try {
    const eventsResult = await pool.query(
      `SELECT * FROM interview_events WHERE role = $1 ORDER BY event_date ASC, start_time ASC`,
      [role]
    )
    const events = eventsResult.rows

    if (events.length === 0) {
      return { message: 'No events found for this role', count: 0 }
    }

    const candidatesResult = await pool.query(
      `SELECT id, score FROM candidates
       WHERE role_applied = $1
         AND status IN ('shortlisted', 'applied', 'marked')
       ORDER BY score DESC`,
      [role]
    )
    const allCandidates = candidatesResult.rows

    let candidateIndex = 0
    let totalAssigned = 0

    for (const evt of events) {
      const totalSlots = evt.num_candidates + (evt.extra_candidates || 0)
      const candidatesForEvent: number[] = []

      while (candidatesForEvent.length < totalSlots && candidateIndex < allCandidates.length) {
        candidatesForEvent.push(allCandidates[candidateIndex]!.id)
        candidateIndex++
      }

      if (candidatesForEvent.length === 0) continue

      await pool.query('DELETE FROM interview_candidates WHERE event_id = $1', [evt.id])

      const values = candidatesForEvent.map((_: any, i: number) => `($1, $${i + 2})`).join(', ')
      const params = [evt.id, ...candidatesForEvent]

      await pool.query(
        `INSERT INTO interview_candidates (event_id, candidate_id) VALUES ${values}
         ON CONFLICT (event_id, candidate_id) DO NOTHING`,
        params
      )

      totalAssigned += candidatesForEvent.length
    }

    return { message: `Auto-assigned ${totalAssigned} candidates across ${events.length} events` }
  } catch (err) {
    console.error('Error in bulk auto-assign:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
