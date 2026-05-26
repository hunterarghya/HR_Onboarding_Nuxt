import jwt from 'jsonwebtoken'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  let userData: any
  try { userData = jwt.verify(token, process.env.JWT_SECRET || 'secret') }
  catch { throw createError({ statusCode: 403, statusMessage: 'Invalid token' }) }

  const id = getRouterParam(event, 'id')
  const pool = usePool()

  try {
    const eventResult = await pool.query('SELECT google_event_id FROM interview_events WHERE id = $1', [id])
    if (eventResult.rows.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Event not found' })
    }

    const googleEventId = eventResult.rows[0].google_event_id

    if (googleEventId) {
      try {
        await deleteCalendarEvent(userData.tokens, googleEventId)
      } catch (calErr: any) {
        console.error('--- [Calendar] Delete sync failed:', calErr.message)
      }
    }

    await pool.query('DELETE FROM interview_events WHERE id = $1', [id])
    return { message: 'Event deleted successfully' }
  } catch (err: any) {
    if (err.statusCode) throw err
    console.error('Error deleting interview event:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
