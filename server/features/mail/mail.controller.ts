import { requireUser } from '~~/server/core/auth/current-user'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody, parseParams } from '~~/server/core/http/validate'
import { googleAuthService } from '../auth/google-auth.service'
import { InviteEventParams, OFFERS_REQUIRED_MESSAGE, SendInvitesBody, SendOffersBody, TEMPLATE_REQUIRED_MESSAGE } from './mail.dto'
import { mailService } from './mail.service'

export const mailController = {
  sendEventInvites: defineApiHandler(async (event) => {
    const user = requireUser(event)
    const { templateId } = await parseBody(event, SendInvitesBody, TEMPLATE_REQUIRED_MESSAGE)
    const { eventId } = parseParams(event, InviteEventParams)
    return mailService.sendInterviewInvites(await googleAuthService.getAuthClientForUser(user.id), user.email, eventId, templateId)
  }),

  sendAllInvites: defineApiHandler(async (event) => {
    const user = requireUser(event)
    const { templateId } = await parseBody(event, SendInvitesBody, TEMPLATE_REQUIRED_MESSAGE)
    return mailService.sendAllPendingInvites(await googleAuthService.getAuthClientForUser(user.id), user.email, templateId)
  }),

  sendOffers: defineApiHandler(async (event) => {
    const user = requireUser(event)
    const { templateId, candidateIds } = await parseBody(event, SendOffersBody, OFFERS_REQUIRED_MESSAGE)
    return mailService.sendOfferLetters(await googleAuthService.getAuthClientForUser(user.id), user.email, templateId, candidateIds)
  }),

  unsentInviteCounts: defineApiHandler(() => mailService.unsentInviteCounts())
}
