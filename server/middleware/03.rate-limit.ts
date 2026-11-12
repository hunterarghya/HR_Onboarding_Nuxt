import { config } from '~~/server/config/env'
import { hitRateLimit, rateRuleFor, TooManyRequestsError } from '~~/server/core/http/rate-limit'
import { toHttpError } from '~~/server/core/errors/to-http-error'

// Runs after auth, so limits that count per user know who's asking (SEC-12).
export default defineEventHandler(async (event) => {
  const rule = rateRuleFor(event.method, event.path)
  if (!rule) return

  const who = rule.per === 'user' && event.context.user
    ? `user-${event.context.user.id}`
    : `ip-${getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'}`
  try {
    await hitRateLimit({ ...rule, limit: rule.limit * config.rateLimit.multiplier }, who)
  } catch (err) {
    if (err instanceof TooManyRequestsError) setResponseHeader(event, 'retry-after', err.retryAfterSeconds)
    throw toHttpError(err, event.context.requestId)
  }
})
