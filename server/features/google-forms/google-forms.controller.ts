import { getAuthClientFromSession } from '~~/server/core/auth/google-session'
import { requireUser } from '~~/server/core/auth/current-user'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody, parseParams, parseQuery } from '~~/server/core/http/validate'
import { CREATE_FORM_MESSAGE, CreateFormBody, DeleteFormQuery, FormIdParams, JobIdParam } from './google-forms.dto'
import { googleFormsService } from './google-forms.service'

export const googleFormsController = {
  list: defineApiHandler(() => googleFormsService.list()),

  create: defineApiHandler(async (event) => {
    const auth = getAuthClientFromSession(requireUser(event))
    const { jobRoleId } = await parseBody(event, CreateFormBody, CREATE_FORM_MESSAGE)
    return googleFormsService.createForJob(auth, jobRoleId)
  }),

  remove: defineApiHandler((event) => {
    const byJob = parseQuery(event, DeleteFormQuery).type === 'job'
    const id = byJob ? String(parseParams(event, JobIdParam).id) : parseParams(event, FormIdParams).id
    return googleFormsService.remove(id, byJob)
  })
}
