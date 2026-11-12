import { z } from 'zod'

/** Accepts the current `whatsappGroupIds` list or the older single `whatsappGroupId`. */
export const ScanWhatsappBody = z.object({
  whatsappGroupIds: z.array(z.string()).nullish(),
  whatsappGroupId: z.string().nullish()
})

/**
 * Body is optional (an unreadable body counts as none) and a non-array formIds is ignored,
 * both as today. Ids are matched as strings against form_id and the database id.
 */
export const ScanFormsBody = z.object({ formIds: z.unknown().optional() }).nullish()

export const selectedFormIds = (body: z.infer<typeof ScanFormsBody>): string[] =>
  Array.isArray(body?.formIds) ? body.formIds.map(String).filter(Boolean) : []
