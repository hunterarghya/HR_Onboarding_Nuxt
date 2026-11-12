import { requireUser } from '~~/server/core/auth/current-user'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody, parseParams } from '~~/server/core/http/validate'
import { CreateFormBody, FormIdParams, JobIdParam } from './google-forms.dto'
import { googleAuthService } from '../auth/google-auth.service'
import { googleFormsService } from './google-forms.service'

export const googleFormsController = {
  list: defineApiHandler(() => googleFormsService.list()),

  create: defineApiHandler(async (event) => {
    const auth = await googleAuthService.getAuthClientForUser(requireUser(event).id)
    const { jobRoleId } = await parseBody(event, CreateFormBody)
    return googleFormsService.createForJob(auth, jobRoleId)
  }),

  remove: defineApiHandler((event) => {
    const { id } = parseParams(event, FormIdParams)
    return googleFormsService.remove(id)
  }),

  /** DELETE /api/jobs/:id/form: forget the application form of a job. */
  removeForJob: defineApiHandler((event) => {
    const { id } = parseParams(event, JobIdParam)
    return googleFormsService.removeForJob(id)
  })
}
