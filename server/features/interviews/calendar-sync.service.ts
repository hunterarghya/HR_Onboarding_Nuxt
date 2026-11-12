import { extractInterviewEvent } from '~~/server/agents/calendar-event/calendar-event.agent'
import { AppError } from '~~/server/core/errors/app-error'
import { enqueue } from '~~/server/core/tasks/queues'
import type { TaskProgress } from '~~/server/core/tasks/task-status'
import { listCalendars, listEvents, watchEvents } from '~~/server/integrations/google/calendar.client'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'
import { googleAuthService } from '../auth/google-auth.service'
import { jobRolesRepository } from '../job-roles/job-roles.repository'
import { interviewEventsRepository } from './interview-events.repository'

/**
 * Fetches recent calendar events (last 7 days to next 60 days).
 */
const fetchRecentCalendarEvents = async (auth: GoogleAuthClient) => {
  // Debug: List all calendars first to see what we have access to (BUG-14: extra call, kept for now)
  try {
    const calendars = await listCalendars(auth)
    console.log(`[Calendar Fetch] Available Calendars for this user:`)
    calendars.forEach((cal) => {
      console.log(`[Calendar Fetch] - Name: "${cal.summary}" | ID: ${cal.id} | Primary: ${cal.primary || false} | Access: ${cal.accessRole}`)
    })
  } catch (err) {
    console.error(`[Calendar Fetch] ❌ Could not fetch calendar list:`, (err as Error).message)
  }

  const timeMin = new Date()
  timeMin.setDate(timeMin.getDate() - 7)
  const timeMax = new Date()
  timeMax.setDate(timeMax.getDate() + 60)

  console.log(`[Calendar Fetch] Querying Google Calendar API (primary)...`)
  console.log(`[Calendar Fetch] Time range: ${timeMin.toISOString()} → ${timeMax.toISOString()}`)

  const items = await listEvents(auth, timeMin, timeMax)
  console.log(`[Calendar Fetch] ✅ API returned ${items.length} events from primary calendar`)

  return items
}

const runSync = async (auth: GoogleAuthClient, onProgress: (p: TaskProgress) => Promise<void>) => {
  const jobs = await jobRolesRepository.findAll()
  const activeRoles = jobs.map(j => j.role)
  console.log(`[Sync] Active roles from DB (${activeRoles.length}):`, activeRoles)

  if (activeRoles.length === 0) {
    console.log(`[Sync] ❌ No active roles found — aborting sync.`)
    return { message: 'No active job roles found', imported: 0 }
  }

  console.log(`[Sync] Fetching calendar events from Google Calendar API...`)
  const calendarEvents = await fetchRecentCalendarEvents(auth)
  console.log(`[Sync] ✅ Found ${calendarEvents.length} calendar events from Google`)

  calendarEvents.forEach((ev, i) => {
    console.log(`[Sync] Event #${i + 1}: id="${ev.id}" | summary="${ev.summary}" | start=${ev.start?.dateTime || ev.start?.date} | end=${ev.end?.dateTime || ev.end?.date}`)
  })

  const existing = await interviewEventsRepository.findLinkedToGoogle()
  const existingGoogleIds = new Set(existing.map(r => r.google_event_id))
  console.log(`[Sync] Already imported event IDs in DB: [${[...existingGoogleIds].join(', ')}]`)

  // BUG-01 (kept until the behaviour-fix phase): anything outside the fetched −7/+60 day window is deleted too
  const calendarEventIds = new Set(calendarEvents.map(e => e.id))
  let deletedCount = 0
  for (const row of existing) {
    if (!calendarEventIds.has(row.google_event_id)) {
      await interviewEventsRepository.deleteById(row.id)
      deletedCount++
      console.log(`[Sync] 🗑️ DELETED from DB (removed from Google Calendar): ${row.google_event_id}`)
    }
  }
  if (deletedCount > 0) console.log(`[Sync] Deleted ${deletedCount} stale events from DB.`)

  let imported = 0
  let skippedDuplicate = 0
  let skippedAgent = 0

  for (let idx = 0; idx < calendarEvents.length; idx++) {
    await onProgress({ done: idx, total: calendarEvents.length, stage: 'reading calendar events' })
    const calEvent = calendarEvents[idx]!
    console.log(`\n[Sync] --- Processing event ${idx + 1}/${calendarEvents.length}: "${calEvent.summary}" (${calEvent.id}) ---`)

    if (existingGoogleIds.has(calEvent.id!)) {
      console.log(`[Sync] ⏭️ SKIPPED (already imported): ${calEvent.id}`)
      skippedDuplicate++
      continue
    }

    console.log(`[Sync] Sending to AI agent for parsing...`)
    const parsed = await extractInterviewEvent(calEvent, activeRoles)

    if (!parsed) {
      console.log(`[Sync] ⏭️ SKIPPED (agent returned null — not an interview or missing data)`)
      skippedAgent++
      continue
    }

    console.log(`[Sync] Agent returned valid interview data:`, JSON.stringify(parsed))

    console.log(`[Sync] Inserting into interview_events table...`)
    await interviewEventsRepository.insertImported({
      ...parsed,
      // the agent answers with one of activeRoles or "Open Role"
      job_role_id: jobs.find(j => j.role === parsed.role)?.id ?? null,
      interview_mode: parsed.interview_mode || 'offline',
      venue_or_link: parsed.venue_or_link || null
    })

    imported++
    console.log(`[Sync] ✅ IMPORTED: ${parsed.role} on ${parsed.event_date} (${parsed.start_time}-${parsed.end_time})`)
  }

  console.log(`\n[Sync] ═══ SYNC COMPLETE ═══`)
  console.log(`[Sync] Total events from calendar: ${calendarEvents.length}`)
  console.log(`[Sync] Imported: ${imported}`)
  console.log(`[Sync] Skipped (duplicate): ${skippedDuplicate}`)
  console.log(`[Sync] Skipped (not interview): ${skippedAgent}`)

  return { message: `Calendar sync complete`, imported }
}

export const CALENDAR_SYNC_TASK_ID = 'calendar.sync'

export const calendarSyncService = {
  /** Queues a sync (409 while one is queued or running); the Google connection is checked first. */
  async enqueueSync(userId: number) {
    await googleAuthService.getAuthClientForUser(userId)
    return enqueue('calendar.sync', { userId }, { taskId: CALENDAR_SYNC_TASK_ID, conflictMessage: 'Calendar sync already in progress' })
  },

  /**
   * Task calendar.sync: imports interview events from the user's Google Calendar, using the
   * calendar-event agent (one LLM call per new event, so this can take minutes).
   */
  async runSync(userId: number, onProgress: (p: TaskProgress) => Promise<void> = async () => {}) {
    console.log(`\n\n╔══════════════════════════════════════════════════════╗`)
    console.log(`║           CALENDAR SYNC STARTED                      ║`)
    console.log(`╚══════════════════════════════════════════════════════╝`)

    try {
      return await runSync(await googleAuthService.getAuthClientForUser(userId), onProgress)
    } catch (err) {
      console.error('[Sync] ❌ FATAL ERROR during sync:', err)
      // the task fails with the reason, and is retried
      throw new Error(`Calendar sync failed: ${(err as Error).message}`, { cause: err })
    }
  },

  /** Registers a webhook (watch) on the primary calendar for push notifications. */
  async registerWebhook(auth: GoogleAuthClient, webhookUrl: string) {
    try {
      const channelId = `hr-interview-${Date.now()}`
      const data = await watchEvents(auth, channelId, webhookUrl)
      console.log(`--- [Calendar] Webhook registered: ${channelId} ---`)
      return { message: 'Webhook registered', data }
    } catch (err) {
      console.error('Error registering webhook:', err)
      throw new AppError(500, 'WEBHOOK_REGISTER_FAILED', 'Failed to register webhook')
    }
  }
}
