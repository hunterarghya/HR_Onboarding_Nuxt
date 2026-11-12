import { requireUser } from '~~/server/core/auth/current-user'
import { getAuthClientFromSession } from '~~/server/core/auth/google-session'

export default defineEventHandler(async (event) => {
  const userData = requireUser(event)

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
        googleEventId = await createCalendarEvent(getAuthClientFromSession(userData), {
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
