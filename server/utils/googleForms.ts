/**
 * Reading job application form responses. Creating forms lives in modules/google-forms.
 */

import { listResponses } from '~~/server/integrations/google/forms.client'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'

/**
 * Fetches responses from a Google Form, optionally filtered by timestamp.
 */
export const fetchFormResponses = async (
  auth: GoogleAuthClient,
  formId: string,
  sinceTimestamp?: Date | null
): Promise<any[]> => {
  console.log(`--- [GoogleForms] Fetching responses for form ${formId} ---`)

  const responses = await listResponses(auth, formId, sinceTimestamp ? `timestamp >= ${sinceTimestamp.toISOString()}` : undefined)

  console.log(`--- [GoogleForms] Found ${responses.length} response(s) ---`)
  return responses
}

/**
 * Extracts a text answer from a form response for a given question ID.
 */
export const extractTextAnswer = (response: any, questionId: string): string => {
  const answer = response.answers?.[questionId]
  if (!answer) return 'N/A'

  const textAnswers = answer.textAnswers?.answers
  if (textAnswers && textAnswers.length > 0) {
    return textAnswers[0].value || 'N/A'
  }
  return 'N/A'
}

/**
 * Extracts file upload info from a form response for a given question ID.
 * Returns the Drive file ID and filename.
 */
export const extractFileAnswer = (response: any, questionId: string): { fileId: string, fileName: string } | null => {
  const answer = response.answers?.[questionId]
  if (!answer) return null

  const fileAnswers = answer.fileUploadAnswers?.answers
  if (fileAnswers && fileAnswers.length > 0) {
    return {
      fileId: fileAnswers[0].fileId,
      fileName: fileAnswers[0].fileName || 'resume.pdf'
    }
  }
  return null
}
