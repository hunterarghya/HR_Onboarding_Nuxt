import type { FormResponse } from '~~/server/integrations/google/forms.client'

/**
 * Extracts a text answer from a form response for a given question ID.
 */
export const extractTextAnswer = (response: FormResponse, questionId: string): string => {
  const answer = response.answers?.[questionId]
  if (!answer) return 'N/A'

  const textAnswers = answer.textAnswers?.answers
  if (textAnswers && textAnswers.length > 0) {
    return textAnswers[0]!.value || 'N/A'
  }
  return 'N/A'
}

/**
 * Extracts file upload info from a form response for a given question ID.
 * Returns the Drive file ID and filename.
 */
export const extractFileAnswer = (response: FormResponse, questionId: string): { fileId: string, fileName: string } | null => {
  const answer = response.answers?.[questionId]
  if (!answer) return null

  const fileAnswers = answer.fileUploadAnswers?.answers
  if (fileAnswers && fileAnswers.length > 0) {
    return {
      fileId: fileAnswers[0]!.fileId!,
      fileName: fileAnswers[0]!.fileName || 'resume.pdf'
    }
  }
  return null
}
