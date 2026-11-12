/**
 * Job application forms: the standard questions, creating a form for a job, reading its answers.
 * Raw Google Forms / Drive calls live in integrations/google/{forms,drive}.client.ts.
 * Fully deterministic — no LLM agent involved.
 */

import { batchUpdateForm, createForm, listResponses, type FormRequest } from '~~/server/integrations/google/forms.client'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'

/**
 * Creates a Google Form for a specific job role with standard application fields:
 * Name, Email, Phone, Experience, Location, CTC, and Resume Upload (PDF).
 *
 * Returns the form ID, public URL, and a map of field names → question IDs.
 */
export const createApplicationForm = async (auth: GoogleAuthClient, jobTitle: string): Promise<{
  formId: string
  formUrl: string
  questionMap: Record<string, string>
}> => {
  console.log(`--- [GoogleForms] Creating form for: ${jobTitle} ---`)

  // 1. Create a blank form
  const { formId, responderUri: formUrl } = await createForm(auth, `Job Application: ${jobTitle}`)

  console.log(`--- [GoogleForms] Form created: ${formId} ---`)

  // 2. Define form questions (Google Forms API does not support programmatic creation of file_upload questions)
  const questionDefs = [
    { title: 'Full Name', field: 'name', required: true, paragraph: false },
    { title: 'Email Address', field: 'email', required: true, paragraph: false },
    { title: 'Phone Number', field: 'phone', required: true, paragraph: false },
    { title: 'Years of Experience', field: 'experience', required: false, paragraph: false },
    { title: 'Current Location', field: 'location', required: false, paragraph: false },
    { title: 'Current CTC / Expected CTC', field: 'ctc', required: false, paragraph: false },
    { title: 'Resume Link (Google Drive / Dropbox / Public PDF URL)', field: 'resume', required: true, paragraph: false }
  ]

  // Build batch update requests for questions
  const requests: FormRequest[] = questionDefs.map((q, index) => ({
    createItem: {
      item: {
        title: q.title,
        questionItem: {
          question: {
            required: q.required,
            textQuestion: { paragraph: q.paragraph }
          }
        }
      },
      location: { index }
    }
  }))

  // 3. Add questions to the form
  const updatedForm = await batchUpdateForm(auth, formId, requests)

  console.log(`--- [GoogleForms] ${requests.length} questions added ---`)

  // 4. Extract question IDs from the updated form
  const items = updatedForm?.items || []

  const fieldNames = questionDefs.map(q => q.field)
  const questionMap: Record<string, string> = {}

  items.forEach((item: any, index: number) => {
    if (index < fieldNames.length && item.questionItem?.question?.questionId) {
      questionMap[fieldNames[index]!] = item.questionItem.question.questionId
    }
  })

  console.log(`--- [GoogleForms] Question map: ${JSON.stringify(questionMap)} ---`)

  return { formId, formUrl, questionMap }
}

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
