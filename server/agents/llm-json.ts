import { z } from 'zod'

// Model output is untrusted input: it is parsed and checked like a request body before anything uses it.

/** A yes/no from a model, which sometimes writes it as "true"/"false". */
export const llmFlag = z.union([z.boolean(), z.enum(['true', 'false']).transform(v => v === 'true')])

/** The model's JSON checked against `schema`, or null (logged under `label`) if it isn't JSON or doesn't fit. */
export const parseLlmJson = <S extends z.ZodType>(raw: string, schema: S, label: string): z.output<S> | null => {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (err) {
    console.error(`[${label}] ❌ Model answer is not JSON: ${(err as Error).message}`)
    return null
  }
  const result = schema.safeParse(value)
  if (!result.success) {
    console.error(`[${label}] ❌ Model answer has an unexpected shape:\n${z.prettifyError(result.error)}`)
    return null
  }
  return result.data
}
