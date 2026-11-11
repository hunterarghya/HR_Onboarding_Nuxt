import { randomUUID } from 'node:crypto'
import { logger } from '~~/server/core/logger'

// Reuse a caller's id (e.g. from a proxy) only if it looks like an id, never arbitrary text.
const VALID_REQUEST_ID = /^[\w-]{8,64}$/

export default defineEventHandler((event) => {
  const incoming = getHeader(event, 'x-request-id')
  const requestId = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID()

  event.context.requestId = requestId
  event.context.log = logger.withTag(requestId.slice(0, 8))
  setResponseHeader(event, 'x-request-id', requestId)
})
