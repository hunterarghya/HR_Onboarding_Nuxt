import jwt from 'jsonwebtoken'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  let userData: any
  try { userData = jwt.verify(token, process.env.JWT_SECRET || 'secret') }
  catch { throw createError({ statusCode: 403, statusMessage: 'Invalid token' }) }

  const body = await readBody(event)
  const { role, event_date, start_time, end_time, num_candidates, extra_candidates, interview_mode, venue_or_link, sync_calendar } = body

  if (!role || !event_date || !start_time || !end_time) {
    throw createError({ statusCode: 400, statusMessage: 'role, event_date, start_time, end_time are required' })
  }

  const mode = interview_mode || 'offline'
  const pool = usePool()

  try {
    let googleEventId = null

    if (sync_calendar !== false) {
      try {
        googleEventId = await createCalendarEvent(userData.tokens, {
          role, event_date, start_time, end_time,
          num_candidates: num_candidates || 5,
          extra_candidates: extra_candidates || 0,
          interview_mode: mode,
          venue_or_link: venue_or_link || ''
        })
      } catch (calErr: any) {
        console.error('--- [Calendar] Sync failed, saving locally only:', calErr.message)
      }
    }

    const result = await pool.query(
      `INSERT INTO interview_events (role, event_date, start_time, end_time, num_candidates, extra_candidates, interview_mode, venue_or_link, google_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [role, event_date, start_time, end_time, num_candidates || 5, extra_candidates || 0, mode, venue_or_link || null, googleEventId]
    )

    setResponseStatus(event, 201)
    return result.rows[0]
  } catch (err) {
    console.error('Error creating interview event:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
