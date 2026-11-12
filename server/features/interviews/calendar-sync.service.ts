import { extractInterviewEvent } from '~~/server/agents/calendar-event/calendar-event.agent'
import { config } from '~~/server/config/env'
import { enqueue } from '~~/server/core/tasks/queues'
import type { TaskProgress } from '~~/server/core/tasks/task-status'
import { listEvents } from '~~/server/integrations/google/calendar.client'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'
import { googleAuthService } from '../auth/google-auth.service'
import { jobRolesRepository } from '../job-roles/job-roles.repository'
import { planCalendarSync } from './calendar-sync.plan'
import { interviewEventsRepository } from './interview-events.repository'

/** Calendar events from the last 7 days to the next 60 (cancelled ones included). */
const fetchRecentCalendarEvents = async (auth: GoogleAuthClient) => {
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
  const { toDelete, toImport, alreadyImported } = planCalendarSync(existing, calendarEvents)

  // only events Google reports as cancelled; anything outside the fetched window is kept (BUG-01)
  for (const { id, googleEventId } of toDelete) {
    await interviewEventsRepository.deleteById(id)
    console.log(`[Sync] 🗑️ DELETED from DB (cancelled in Google Calendar): ${googleEventId}`)
  }

  let imported = 0
  let skippedAgent = 0

  for (const [idx, calEvent] of toImport.entries()) {
    await onProgress({ done: idx, total: toImport.length, stage: 'reading calendar events' })
    console.log(`\n[Sync] --- Processing event ${idx + 1}/${toImport.length}: "${calEvent.summary}" (${calEvent.id}) ---`)

    const parsed = await extractInterviewEvent(calEvent, activeRoles, config.app.timeZone)
    if (!parsed) {
      console.log(`[Sync] ⏭️ SKIPPED (agent returned null — not an interview or missing data)`)
      skippedAgent++
      continue
    }

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
  console.log(`[Sync] Already imported: ${alreadyImported}`)
  console.log(`[Sync] Deleted (cancelled in Google): ${toDelete.length}`)
  console.log(`[Sync] Skipped (not interview): ${skippedAgent}`)

  return { message: `Calendar sync complete`, imported, deleted: toDelete.length }
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
  }
}
