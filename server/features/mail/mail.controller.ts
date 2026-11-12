import { requireUser } from '~~/server/core/auth/current-user'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody, parseParams } from '~~/server/core/http/validate'
import { googleAuthService } from '../auth/google-auth.service'
import { profileService } from '../auth/profile.service'
import { InviteEventParams, OFFERS_REQUIRED_MESSAGE, SendInvitesBody, SendOffersBody, TEMPLATE_REQUIRED_MESSAGE } from './mail.dto'
import { mailService, type Sender } from './mail.service'

/** The HR's address and company; 400 until they've set a company name. */
const senderFor = async (user: { id: number, email: string }): Promise<Sender> =>
  ({ email: user.email, companyName: await profileService.requireCompanyName(user.id) })

export const mailController = {
  sendEventInvites: defineApiHandler(async (event) => {
    const user = requireUser(event)
    const { templateId } = await parseBody(event, SendInvitesBody, TEMPLATE_REQUIRED_MESSAGE)
    const { eventId } = parseParams(event, InviteEventParams)
    const sender = await senderFor(user)
    return mailService.sendInterviewInvites(await googleAuthService.getAuthClientForUser(user.id), sender, eventId, templateId)
  }),

  sendAllInvites: defineApiHandler(async (event) => {
    const user = requireUser(event)
    const { templateId } = await parseBody(event, SendInvitesBody, TEMPLATE_REQUIRED_MESSAGE)
    const sender = await senderFor(user)
    return mailService.sendAllPendingInvites(await googleAuthService.getAuthClientForUser(user.id), sender, templateId)
  }),

  sendOffers: defineApiHandler(async (event) => {
    const user = requireUser(event)
    const { templateId, candidateIds } = await parseBody(event, SendOffersBody, OFFERS_REQUIRED_MESSAGE)
    const sender = await senderFor(user)
    return mailService.sendOfferLetters(await googleAuthService.getAuthClientForUser(user.id), sender, templateId, candidateIds)
  }),

  unsentInviteCounts: defineApiHandler(() => mailService.unsentInviteCounts())
}
