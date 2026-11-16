import { classifyEmail } from '~~/server/agents/email-classifier/email-classifier.agent'
import type { LlmProvider } from '~~/server/integrations/llm'
import { getPdfAttachments, listMessagesSince } from '~~/server/integrations/google/gmail.client'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'
import type { RawAttachment } from '../ingestion.types'

/** PDFs from emails after `since` that the email classifier (using `llm`) calls job applications. */
export const collectFromGmail = async (auth: GoogleAuthClient, since: Date, llm: LlmProvider): Promise<RawAttachment[]> => {
  const attachments: RawAttachment[] = []

  const emails = await listMessagesSince(auth, since)
  for (const email of emails) {
    const payload = email.payload
    if (!payload || !payload.parts) continue

    const subject = payload.headers?.find(h => h.name === 'Subject')?.value || ''
    const bodyText = email.snippet || ''
    const senderEmail = payload.headers?.find(h => h.name === 'From')?.value || ''

    const analysis = await classifyEmail(subject, bodyText, llm)
    if (analysis.isApplication) {
      console.log(`--- [Gmail] ✅ Application Found: "${subject}" ---`)
      const gmailAttachments = await getPdfAttachments(auth, email.id!, payload.parts)
      attachments.push(...gmailAttachments.map(a => ({
        ...a, source: 'Gmail', sender: senderEmail
      })))
    }
  }

  return attachments
}
