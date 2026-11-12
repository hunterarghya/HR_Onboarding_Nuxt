import type { FormRequest } from '~~/server/integrations/google/forms.client'

// The standard job application form. `field` is the key the scanner uses to read each answer
// (google_forms.question_map maps field → Google question id).

export const APPLICATION_QUESTIONS = [
  { title: 'Full Name', field: 'name', required: true, paragraph: false },
  { title: 'Email Address', field: 'email', required: true, paragraph: false },
  { title: 'Phone Number', field: 'phone', required: true, paragraph: false },
  { title: 'Years of Experience', field: 'experience', required: false, paragraph: false },
  { title: 'Current Location', field: 'location', required: false, paragraph: false },
  { title: 'Current CTC / Expected CTC', field: 'ctc', required: false, paragraph: false },
  // The Forms API can't create file-upload questions, so applicants paste a link
  { title: 'Resume Link (Google Drive / Dropbox / Public PDF URL)', field: 'resume', required: true, paragraph: false }
]

export const applicationFormTitle = (jobTitle: string) => `Job Application: ${jobTitle}`

/** batchUpdate requests that add every question, in order. */
export const buildQuestionRequests = (): FormRequest[] => APPLICATION_QUESTIONS.map((q, index) => ({
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

/** field → question id, read from the updated form's items (same order as the questions). */
export const mapQuestionIds = (items: Array<{ questionItem?: { question?: { questionId?: string | null } | null } | null }>): Record<string, string> => {
  const questionMap: Record<string, string> = {}
  items.forEach((item, index) => {
    const field = APPLICATION_QUESTIONS[index]?.field
    const questionId = item.questionItem?.question?.questionId
    if (field && questionId) questionMap[field] = questionId
  })
  return questionMap
}
