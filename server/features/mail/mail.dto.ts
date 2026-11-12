import { z } from 'zod'

// Phase 3: same inputs as today; non-numeric ids (which used to fail inside the query) now return 400.

const id = z.coerce.number().int().positive()

export const InviteEventParams = z.object({ eventId: id })

export const SendInvitesBody = z.object({ templateId: id })
export const TEMPLATE_REQUIRED_MESSAGE = 'templateId is required'

export const SendOffersBody = z.object({
  templateId: id,
  candidateIds: z.array(id).min(1)
})
export const OFFERS_REQUIRED_MESSAGE = 'templateId and candidateIds are required'
