import { setResponseStatus, type H3Event } from 'h3'
import { requireUser } from '~~/server/core/auth/current-user'
import { getAuthClientFromSession } from '~~/server/core/auth/google-session'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody, parseParams } from '~~/server/core/http/validate'
import { calendarSyncService } from './calendar-sync.service'
import {
  ASSIGN_MESSAGE, AUTO_ASSIGN_ALL_MESSAGE, AssignCandidatesBody, AutoAssignAllBody,
  CREATE_EVENT_MESSAGE, CreateEventBody, EligibleParams, EventIdParams,
  REGISTER_WEBHOOK_MESSAGE, RegisterWebhookBody
} from './interviews.dto'
import { interviewAssignmentsService } from './interview-assignments.service'
import { interviewEventsService } from './interview-events.service'

const googleAuth = (event: H3Event) => getAuthClientFromSession(requireUser(event))

/** POST creates and PATCH edits the same list; only the reply wording differs (unchanged). */
const replaceAssignments = (message: string) => defineApiHandler(async (event) => {
  const { id } = parseParams(event, EventIdParams)
  const { candidate_ids } = await parseBody(event, AssignCandidatesBody, ASSIGN_MESSAGE)
  const count = await interviewAssignmentsService.replace(id, candidate_ids)
  return { message, count }
})

export const interviewsController = {
  listEvents: defineApiHandler(() => interviewEventsService.list()),

  createEvent: defineApiHandler(async (event) => {
    const auth = googleAuth(event)
    const body = await parseBody(event, CreateEventBody, CREATE_EVENT_MESSAGE)
    const created = await interviewEventsService.create(auth, body)
    setResponseStatus(event, 201)
    return created
  }),

  deleteEvent: defineApiHandler(async (event) => {
    const auth = googleAuth(event)
    const { id } = parseParams(event, EventIdParams)
    await interviewEventsService.remove(auth, id)
    return { message: 'Event deleted successfully' }
  }),

  listEventCandidates: defineApiHandler((event) => {
    const { id } = parseParams(event, EventIdParams)
    return interviewAssignmentsService.listForEvent(id)
  }),

  assignCandidates: replaceAssignments('Candidates assigned successfully'),
  updateAssignedCandidates: replaceAssignments('Candidates updated successfully'),

  autoAssign: defineApiHandler((event) => {
    const { id } = parseParams(event, EventIdParams)
    return interviewAssignmentsService.autoAssign(id)
  }),

  autoAssignAll: defineApiHandler(async (event) => {
    const { role } = await parseBody(event, AutoAssignAllBody, AUTO_ASSIGN_ALL_MESSAGE)
    return interviewAssignmentsService.autoAssignAll(role)
  }),

  eligibleCandidates: defineApiHandler((event) => {
    const { eventId } = parseParams(event, EligibleParams)
    return interviewAssignmentsService.eligibleForEvent(eventId)
  }),

  syncCalendar: defineApiHandler(event => calendarSyncService.sync(googleAuth(event))),

  registerWebhook: defineApiHandler(async (event) => {
    const auth = googleAuth(event)
    const { webhook_url } = await parseBody(event, RegisterWebhookBody, REGISTER_WEBHOOK_MESSAGE)
    return calendarSyncService.registerWebhook(auth, webhook_url)
  }),

  /** Google Calendar push notifications (public route). Acknowledged only; nothing is processed yet. */
  calendarWebhook: defineApiHandler((event) => {
    setResponseStatus(event, 200)
    console.log('--- [Calendar Webhook] Push notification received ---')
    return 'OK'
  })
}
