import { z } from 'zod'

// Phase 3 DTOs accept what the API accepts today; they only turn inputs that used to crash into 400s.
// Stricter rules (lengths, known types) arrive with the validation phase.

export const TemplateIdParams = z.object({ id: z.coerce.number().int().positive() })

export const SaveTemplateBody = z.object({
  name: z.string().min(1),
  subject: z.string().nullish(),
  body: z.string().min(1),
  type: z.string().nullish()
})
export const SAVE_TEMPLATE_MESSAGE = 'name and body are required'

const SampleData = z.record(z.string(), z.unknown())

export const PreviewTemplateBody = z.object({
  sampleData: SampleData.nullish()
})

export const PreviewRawTemplateBody = z.object({
  subject: z.string().nullish(),
  body: z.string().min(1),
  type: z.string().nullish(),
  sampleData: SampleData.nullish()
})
export const PREVIEW_RAW_MESSAGE = 'body is required'

export type SaveTemplateInput = z.infer<typeof SaveTemplateBody>
export type PreviewRawTemplateInput = z.infer<typeof PreviewRawTemplateBody>
