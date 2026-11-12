import { getHeader, setResponseStatus, type H3Event } from 'h3'
import { requireUser } from '~~/server/core/auth/current-user'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody, parseParams } from '~~/server/core/http/validate'
import { googleAuthService } from '../auth/google-auth.service'
import { calendarSyncService } from './calendar-sync.service'
import { calendarWebhookService } from './calendar-webhook.service'
import { AssignCandidatesBody, AutoAssignAllBody, CreateEventBody, EligibleParams, EventIdParams } from './interviews.dto'
import { interviewAssignmentsService } from './interview-assignments.service'
import { interviewEventsService } from './interview-events.service'

const googleAuth = (event: H3Event) => googleAuthService.getAuthClientForUser(requireUser(event).id)

/** POST creates and PATCH edits the same list; only the reply wording differs (unchanged). */
const replaceAssignments = (message: string) => defineApiHandler(async (event) => {
  const { id } = parseParams(event, EventIdParams)
  const { candidate_ids } = await parseBody(event, AssignCandidatesBody)
  const count = await interviewAssignmentsService.replace(id, candidate_ids)
  return { message, count }
})

export const interviewsController = {
  listEvents: defineApiHandler(() => interviewEventsService.list()),

  createEvent: defineApiHandler(async (event) => {
    const auth = await googleAuth(event)
    const body = await parseBody(event, CreateEventBody)
    const created = await interviewEventsService.create(auth, body)
    setResponseStatus(event, 201)
    return created
  }),

  deleteEvent: defineApiHandler(async (event) => {
    const auth = await googleAuth(event)
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
    const { role } = await parseBody(event, AutoAssignAllBody)
    return interviewAssignmentsService.autoAssignAll(role)
  }),

  eligibleCandidates: defineApiHandler((event) => {
    const { eventId } = parseParams(event, EligibleParams)
    return interviewAssignmentsService.eligibleForEvent(eventId)
  }),

  /** 202 { taskId }: the sync runs as a background task (GET /api/tasks/:taskId). */
  syncCalendar: defineApiHandler(async (event) => {
    const task = await calendarSyncService.enqueueSync(requireUser(event).id)
    setResponseStatus(event, 202)
    return task
  }),

  /** Opens a push channel on the HR's Google Calendar, at PUBLIC_BASE_URL/api/interviews/webhook. */
  registerWebhook: defineApiHandler(event => calendarWebhookService.register(requireUser(event).id)),

  /** Google Calendar push notifications (public route): checked against the channel's secret token. */
  calendarWebhook: defineApiHandler(event => calendarWebhookService.handleNotification({
    channelId: getHeader(event, 'x-goog-channel-id'),
    token: getHeader(event, 'x-goog-channel-token'),
    resourceState: getHeader(event, 'x-goog-resource-state')
  }))
}
