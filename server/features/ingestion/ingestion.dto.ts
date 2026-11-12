import { z } from 'zod'

/** WhatsApp group ids look like "120363012345678901@g.us". */
const whatsappGroupId = z.string().regex(/^[\w.-]+@g\.us$/, 'Not a WhatsApp group id')

export const ScanWhatsappBody = z.object({
  whatsappGroupIds: z.array(whatsappGroupId).max(50).default([])
}).strict()

/** Google form ids (or database ids) of the forms to scan; none means every form. */
export const ScanFormsBody = z.preprocess(body => body ?? {}, z.object({
  formIds: z.array(z.string().regex(/^[\w-]{1,200}$/, 'Not a form id')).max(100).default([])
}).strict())
