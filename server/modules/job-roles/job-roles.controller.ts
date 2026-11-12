import { setResponseStatus } from 'h3'
import { requireUser } from '~~/server/core/auth/current-user'
import { getAuthClientFromSession } from '~~/server/core/auth/google-session'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody, parseParams } from '~~/server/core/http/validate'
import { CreateJobRoleBody, JobIdParams, NO_FIELDS_MESSAGE, UpdateJobRoleBody } from './job-roles.dto'
import { jobRolesService } from './job-roles.service'

export const jobRolesController = {
  list: defineApiHandler(() => jobRolesService.list()),

  create: defineApiHandler(async (event) => {
    const user = requireUser(event)
    const body = await parseBody(event, CreateJobRoleBody)
    const job = await jobRolesService.create(body, user.tokens ? getAuthClientFromSession(user) : null)
    setResponseStatus(event, 201)
    return job
  }),

  update: defineApiHandler(async (event) => {
    const { id } = parseParams(event, JobIdParams)
    return jobRolesService.update(id, await parseBody(event, UpdateJobRoleBody, NO_FIELDS_MESSAGE))
  }),

  remove: defineApiHandler(async (event) => {
    const { id } = parseParams(event, JobIdParams)
    await jobRolesService.remove(id)
    return { message: 'Job role deleted successfully' }
  })
}
