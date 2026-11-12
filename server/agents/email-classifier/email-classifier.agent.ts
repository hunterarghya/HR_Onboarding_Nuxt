import { getLlm, type LlmProvider } from '~~/server/integrations/llm'
import { buildEmailClassifierPrompt } from './email-classifier.prompt'

export interface EmailClassification {
  isApplication: boolean
  position: string | null
}

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
    const parsed = JSON.parse(raw)
    return {
      isApplication: Boolean(parsed?.isApplication),
      position: typeof parsed?.position === 'string' ? parsed.position : null
    }
  } catch (err) {
    console.error('Error in email analysis:', err)
    return { isApplication: false, position: null }
  }
}
