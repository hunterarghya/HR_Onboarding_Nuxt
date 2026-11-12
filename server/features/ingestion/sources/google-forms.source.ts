import { listResponses } from '~~/server/integrations/google/forms.client'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'
import type { RawAttachment } from '../ingestion.types'
import { extractTextAnswer } from './form-answers'
import { fetchResumeFromAnswer } from './resume-fetcher'

interface ScannableForm {
  form_id: string
  question_map: Record<string, string> | null
}

/**
 * Resume PDFs from a form's responses since `since` (all responses if null).
 * A response without a usable resume is logged and skipped.
 */
export const collectFromForm = async (auth: GoogleAuthClient, form: ScannableForm, since: Date | null): Promise<RawAttachment[]> => {
  const formId = form.form_id
  const questionMap = form.question_map || {}
  const attachments: RawAttachment[] = []

  console.log(`--- [GoogleForms] Fetching responses for form ${formId} ---`)
  const responses = await listResponses(auth, formId, since ? `timestamp >= ${since.toISOString()}` : undefined)
  console.log(`--- [GoogleForms] Found ${responses.length} response(s) ---`)

  for (const response of responses) {
    try {
      // Extract resume answer (supports Drive links, direct URLs, or file upload answers)
      const resumeQuestionId = questionMap.resume
      if (!resumeQuestionId) {
        console.log(`--- [Forms Scanner] No resume question mapped for form ${formId}, skipping ---`)
        continue
      }

      const resume = await fetchResumeFromAnswer(auth, response, resumeQuestionId)

      // Extract candidate email
      const senderEmail = questionMap.email ? extractTextAnswer(response, questionMap.email) : null

      if (resume) {
        attachments.push({
          filename: resume.fileName,
          data: resume.data,
          source: 'GoogleForms',
          sender: senderEmail ?? undefined
        })
        console.log(`--- [Forms Scanner] ✅ Resume collected: ${resume.fileName} from ${senderEmail} ---`)
      } else {
        console.warn(`--- [Forms Scanner] ⚠️ Could not retrieve PDF for response ${response.responseId} (${senderEmail}) ---`)
      }
    } catch (respErr) {
      console.error(`--- [Forms Scanner] Error processing response ${response.responseId}: ${(respErr as Error).message} ---`)
    }
  }

  return attachments
}
