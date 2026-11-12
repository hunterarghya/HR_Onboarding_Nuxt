import { z } from 'zod'

const id = z.coerce.number().int().positive()

export const InviteEventParams = z.object({ eventId: id })

export const SendInvitesBody = z.object({ templateId: id }).strict()

export const SendOffersBody = z.object({
  templateId: id,
  candidateIds: z.array(z.number().int().positive()).min(1).max(500)
    .refine(ids => new Set(ids).size === ids.length, 'candidateIds has duplicates')
}).strict()
