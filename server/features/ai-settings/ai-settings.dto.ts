import { z } from 'zod'
import { KEY_PROVIDERS } from '~~/server/integrations/llm'

export const ProviderParams = z.object({ provider: z.enum(KEY_PROVIDERS) })

const apiKey = z.string().trim().min(10, 'That doesn\'t look like an API key').max(500)
  .regex(/^[\w.-]+$/, 'An API key has no spaces or special characters')
const model = z.string().trim().min(1).max(200).regex(/^[\w./:-]+$/, 'Not a model name')

/**
 * Plug in (or replace) a key, and/or change the model. The key is optional so the model can be
 * changed without typing the key again; a provider without a stored key needs one.
 */
export const SaveKeyBody = z.object({ apiKey: apiKey.optional(), model: model.optional() }).strict()
  .refine(b => b.apiKey !== undefined || b.model !== undefined, 'Nothing to save')

/** Which AI the app uses for this HR: their Groq or Gemini key, or the server's default. */
export const SetActiveBody = z.object({ provider: z.enum(['server', ...KEY_PROVIDERS]) }).strict()

/** Models a provider offers; with a key not saved yet, so the HR can pick a model before saving. */
export const ListModelsBody = z.object({ apiKey: apiKey.optional() }).strict()

export type SaveKeyInput = z.infer<typeof SaveKeyBody>
