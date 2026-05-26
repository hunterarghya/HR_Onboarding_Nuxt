import jwt from 'jsonwebtoken'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  let userData: any
  try { userData = jwt.verify(token, process.env.JWT_SECRET || 'secret') }
  catch { throw createError({ statusCode: 403, statusMessage: 'Invalid token' }) }

  const pool = usePool()

  console.log(`\n\n╔══════════════════════════════════════════════════════╗`)
  console.log(`║           CALENDAR SYNC STARTED                      ║`)
  console.log(`╚══════════════════════════════════════════════════════╝`)

  try {
    const rolesResult = await pool.query('SELECT role FROM job_roles')
    const activeRoles = rolesResult.rows.map((r: any) => r.role)
    console.log(`[Sync] Active roles from DB (${activeRoles.length}):`, activeRoles)

    if (activeRoles.length === 0) {
      console.log(`[Sync] ❌ No active roles found — aborting sync.`)
      return { message: 'No active job roles found', imported: 0 }
    }

    console.log(`[Sync] Fetching calendar events from Google Calendar API...`)
    const calendarEvents = await fetchRecentCalendarEvents(userData.tokens)
    console.log(`[Sync] ✅ Found ${calendarEvents.length} calendar events from Google`)

    calendarEvents.forEach((ev: any, i: number) => {
      console.log(`[Sync] Event #${i + 1}: id="${ev.id}" | summary="${ev.summary}" | start=${ev.start?.dateTime || ev.start?.date} | end=${ev.end?.dateTime || ev.end?.date}`)
    })

    const existingResult = await pool.query(
      'SELECT id, google_event_id FROM interview_events WHERE google_event_id IS NOT NULL'
    )
    const existingGoogleIds = new Set(existingResult.rows.map((r: any) => r.google_event_id))
    console.log(`[Sync] Already imported event IDs in DB: [${[...existingGoogleIds].join(', ')}]`)

    const calendarEventIds = new Set(calendarEvents.map((e: any) => e.id))
    let deletedCount = 0
    for (const row of existingResult.rows) {
      if (!calendarEventIds.has(row.google_event_id)) {
        await pool.query('DELETE FROM interview_events WHERE id = $1', [row.id])
        deletedCount++
        console.log(`[Sync] 🗑️ DELETED from DB (removed from Google Calendar): ${row.google_event_id}`)
      }
    }
    if (deletedCount > 0) console.log(`[Sync] Deleted ${deletedCount} stale events from DB.`)

    let imported = 0
    let skippedDuplicate = 0
    let skippedAgent = 0

    for (let idx = 0; idx < calendarEvents.length; idx++) {
      const calEvent = calendarEvents[idx]!
      console.log(`\n[Sync] --- Processing event ${idx + 1}/${calendarEvents.length}: "${(calEvent as any).summary}" (${(calEvent as any).id}) ---`)

      if (existingGoogleIds.has((calEvent as any).id)) {
        console.log(`[Sync] ⏭️ SKIPPED (already imported): ${(calEvent as any).id}`)
        skippedDuplicate++
        continue
      }

      console.log(`[Sync] Sending to AI agent for parsing...`)
      const parsed = await parseCalendarEvent(calEvent, activeRoles)

      if (!parsed) {
        console.log(`[Sync] ⏭️ SKIPPED (agent returned null — not an interview or missing data)`)
        skippedAgent++
        continue
      }

      console.log(`[Sync] Agent returned valid interview data:`, JSON.stringify(parsed))

      console.log(`[Sync] Inserting into interview_events table...`)
      await pool.query(
        `INSERT INTO interview_events (role, event_date, start_time, end_time, num_candidates, extra_candidates, interview_mode, venue_or_link, google_event_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT DO NOTHING`,
        [parsed.role, parsed.event_date, parsed.start_time, parsed.end_time, parsed.num_candidates, parsed.extra_candidates, parsed.interview_mode || 'offline', parsed.venue_or_link || null, parsed.google_event_id]
      )

      imported++
      console.log(`[Sync] ✅ IMPORTED: ${parsed.role} on ${parsed.event_date} (${parsed.start_time}-${parsed.end_time})`)
    }

    console.log(`\n[Sync] ═══ SYNC COMPLETE ═══`)
    console.log(`[Sync] Total events from calendar: ${calendarEvents.length}`)
    console.log(`[Sync] Imported: ${imported}`)
    console.log(`[Sync] Skipped (duplicate): ${skippedDuplicate}`)
    console.log(`[Sync] Skipped (not interview): ${skippedAgent}`)

    return { message: `Calendar sync complete`, imported }
  } catch (err: any) {
    console.error('[Sync] ❌ FATAL ERROR during sync:', err)
    throw createError({ statusCode: 500, statusMessage: 'Calendar sync failed', data: { details: err.message } })
  }
})
