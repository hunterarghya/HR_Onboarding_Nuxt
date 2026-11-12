import Handlebars from 'handlebars'
import { z } from 'zod'

export const TEMPLATE_TYPES = ['custom', 'rejection', 'invite', 'offer'] as const
export type TemplateType = typeof TEMPLATE_TYPES[number]

export const TemplateIdParams = z.object({ id: z.coerce.number().int().positive() })

/** Template text that Handlebars can compile, so a broken template is caught when it's saved, not when mail goes out. */
const templateText = (max: number) => z.string().max(max).superRefine((text, ctx) => {
  try {
    Handlebars.parse(text)
  } catch (err) {
    ctx.addIssue({ code: 'custom', message: `Template syntax error: ${(err as Error).message.split('\n')[0]}` })
  }
})

export const SaveTemplateBody = z.object({
  name: z.string().trim().min(1).max(255),
  subject: templateText(500).default(''),
  body: templateText(100_000).refine(b => b.trim().length > 0, 'body is required'),
  type: z.enum(TEMPLATE_TYPES).default('custom')
}).strict()

const SampleData = z.record(z.string().max(100), z.unknown())
  .refine(d => Object.keys(d).length <= 100, 'Too many sample fields')

export const PreviewTemplateBody = z.object({
  sampleData: SampleData.nullish()
}).strict()

export const PreviewRawTemplateBody = z.object({
  subject: templateText(500).default(''),
  body: templateText(100_000).refine(b => b.trim().length > 0, 'body is required'),
  type: z.enum(TEMPLATE_TYPES).default('custom'),
  sampleData: SampleData.nullish()
}).strict()

export type SaveTemplateInput = z.infer<typeof SaveTemplateBody>
export type PreviewRawTemplateInput = z.infer<typeof PreviewRawTemplateBody>
