import { google, type forms_v1 } from 'googleapis'
import type { GoogleAuthClient } from './oauth'

const formsFor = (auth: GoogleAuthClient) => google.forms({ version: 'v1', auth })

export type FormResponse = forms_v1.Schema$FormResponse
export type FormRequest = forms_v1.Schema$Request

/** Creates a blank form; returns its id and the public URL respondents use. */
export const createForm = async (auth: GoogleAuthClient, title: string) => {
  const res = await formsFor(auth).forms.create({ requestBody: { info: { title } } })
  return { formId: res.data.formId!, responderUri: res.data.responderUri! }
}

/** Applies batchUpdate requests and returns the updated form (its items carry the new question ids). */
export const batchUpdateForm = async (auth: GoogleAuthClient, formId: string, requests: FormRequest[]) => {
  const res = await formsFor(auth).forms.batchUpdate({
    formId,
    requestBody: { requests, includeFormInResponse: true }
  })
  return res.data.form
}

/** Form responses, optionally narrowed by a Forms API filter such as `timestamp >= …`. */
export const listResponses = async (auth: GoogleAuthClient, formId: string, filter?: string): Promise<FormResponse[]> => {
  const res = await formsFor(auth).forms.responses.list(filter ? { formId, filter } : { formId })
  return res.data.responses || []
}
