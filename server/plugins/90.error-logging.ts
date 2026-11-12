import { logger } from '~~/server/core/logger'

// One place that logs server-side failures, with the request id the client also receives.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500
    if (statusCode < 500) return
    const log = event?.context.log ?? logger
    log.error(`${event?.method ?? ''} ${event?.path ?? '(no request)'} failed`, error.cause ?? error)
  })
})
