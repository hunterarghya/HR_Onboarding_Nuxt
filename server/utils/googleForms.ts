/**
 * Google Forms Integration Utility
 * Creates application forms via the Google Forms API and fetches responses.
 * Downloads uploaded resume PDFs via the Google Drive API.
 * Fully deterministic — no LLM agent involved.
 */

import { google } from 'googleapis'

const getOAuth2Client = (tokens: any) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  oauth2Client.setCredentials(tokens)
  return oauth2Client
}

/**
 * Creates a Google Form for a specific job role with standard application fields:
 * Name, Email, Phone, Experience, Location, CTC, and Resume Upload (PDF).
 *
 * Returns the form ID, public URL, and a map of field names → question IDs.
 */
export const createApplicationForm = async (tokens: any, jobTitle: string): Promise<{
  formId: string
  formUrl: string
  questionMap: Record<string, string>
}> => {
  const auth = getOAuth2Client(tokens)
  const forms = google.forms({ version: 'v1', auth })

  console.log(`--- [GoogleForms] Creating form for: ${jobTitle} ---`)

  // 1. Create a blank form
  const createResponse = await forms.forms.create({
    requestBody: {
      info: {
        title: `Job Application: ${jobTitle}`
      }
    }
  })

  const formId = createResponse.data.formId!
  const formUrl = createResponse.data.responderUri!

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
  const requests: any[] = questionDefs.map((q, index) => ({
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
  const batchResponse = await forms.forms.batchUpdate({
    formId,
    requestBody: {
      requests,
      includeFormInResponse: true
    }
  })

  console.log(`--- [GoogleForms] ${requests.length} questions added ---`)

  // 4. Extract question IDs from the updated form
  const updatedForm = batchResponse.data.form
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
 * Extracts a Google Drive file ID from a Drive share or view URL.
 */
export const extractDriveFileId = (url: string): string | null => {
  if (!url || typeof url !== 'string') return null
  const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return driveMatch ? driveMatch[1] : null
}

/**
 * Fetches responses from a Google Form, optionally filtered by timestamp.
 */
export const fetchFormResponses = async (
  tokens: any,
  formId: string,
  sinceTimestamp?: Date | null
): Promise<any[]> => {
  const auth = getOAuth2Client(tokens)
  const forms = google.forms({ version: 'v1', auth })

  const params: any = { formId }
  if (sinceTimestamp) {
    params.filter = `timestamp >= ${sinceTimestamp.toISOString()}`
  }

  console.log(`--- [GoogleForms] Fetching responses for form ${formId} ---`)

  const response = await forms.forms.responses.list(params)
  const responses = response.data.responses || []

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
export const extractFileAnswer = (response: any, questionId: string): { fileId: string; fileName: string } | null => {
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

/**
 * Downloads a file from Google Drive by file ID.
 * Returns the file content as a base64 string.
 */
export const downloadDriveFile = async (tokens: any, fileId: string): Promise<string> => {
  const auth = getOAuth2Client(tokens)
  const drive = google.drive({ version: 'v3', auth })

  console.log(`--- [GoogleForms] Downloading file ${fileId} from Drive ---`)

  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )

  const buffer = Buffer.from(response.data as ArrayBuffer)
  const base64 = buffer.toString('base64')

  console.log(`--- [GoogleForms] File downloaded (${buffer.length} bytes) ---`)
  return base64
}
