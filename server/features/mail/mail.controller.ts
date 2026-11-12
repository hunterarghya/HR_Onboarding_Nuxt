import { setResponseStatus } from 'h3'
import { requireUser } from '~~/server/core/auth/current-user'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody, parseParams } from '~~/server/core/http/validate'
import { InviteEventParams, SendInvitesBody, SendOffersBody } from './mail.dto'
import { mailService } from './mail.service'

// Bulk sends answer 202 { taskId, status: 'queued' }; the UI polls GET /api/tasks/:taskId for the
// counts. Missing company name (400), Google connection (401), template or event (404) are
// reported here, before anything is queued.

export const mailController = {
  sendEventInvites: defineApiHandler(async (event) => {
    const user = requireUser(event)
    const { templateId } = await parseBody(event, SendInvitesBody)
    const { eventId } = parseParams(event, InviteEventParams)
    const task = await mailService.enqueueEventInvites(user.id, eventId, templateId)
    setResponseStatus(event, 202)
    return task
  }),

  sendAllInvites: defineApiHandler(async (event) => {
    const user = requireUser(event)
    const { templateId } = await parseBody(event, SendInvitesBody)
    const task = await mailService.enqueueAllInvites(user.id, templateId)
    setResponseStatus(event, 202)
    return task
  }),

  sendOffers: defineApiHandler(async (event) => {
    const user = requireUser(event)
    const { templateId, candidateIds } = await parseBody(event, SendOffersBody)
    const task = await mailService.enqueueOffers(user.id, templateId, candidateIds)
    setResponseStatus(event, 202)
    return task
  }),

  unsentInviteCounts: defineApiHandler(() => mailService.unsentInviteCounts())
}
