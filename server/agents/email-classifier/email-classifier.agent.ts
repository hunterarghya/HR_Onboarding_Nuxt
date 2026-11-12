import { z } from 'zod'
import { getLlm, type LlmProvider } from '~~/server/integrations/llm'
import { llmFlag, parseLlmJson } from '../llm-json'
import { buildEmailClassifierPrompt } from './email-classifier.prompt'

/** The answer the model is asked for; a missing or odd position just means "not stated". */
const EmailClassificationSchema = z.object({
  isApplication: llmFlag,
  position: z.string().trim().min(1).max(255).nullish().catch(null).transform(p => p ?? null)
})

export type EmailClassification = z.output<typeof EmailClassificationSchema>

const NOT_AN_APPLICATION: EmailClassification = { isApplication: false, position: null }

/**
 * Identifies if an email is a job application and contains a resume.
 * Never throws: any model or parsing failure means "not an application".
 */
export const classifyEmail = async (emailSubject: string, emailBody: string, llm: LlmProvider = getLlm()): Promise<EmailClassification> => {
  console.log('Analyzing email content...')

  const prompt = buildEmailClassifierPrompt(emailSubject, emailBody)

  try {
    const raw = await llm.generateJson(prompt)

    console.log(`Raw AI Response (Email Analysis):`, raw)
    return parseLlmJson(raw, EmailClassificationSchema, 'EmailClassifier') ?? NOT_AN_APPLICATION
  } catch (err) {
    console.error('Error in email analysis:', err)
    return NOT_AN_APPLICATION
  }
}
