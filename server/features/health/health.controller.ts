import { setResponseStatus } from 'h3'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { healthService } from './health.service'

export const healthController = {
  check: defineApiHandler(async (event) => {
    const result = await healthService.check()
    if (result.status !== 'ok') setResponseStatus(event, 503)
    return result
  })
}
