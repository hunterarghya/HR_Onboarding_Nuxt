import type { SessionUser } from '../core/auth/session-token'
import type { Logger } from '../core/logger'

declare module 'h3' {
  interface H3EventContext {
    requestId: string
    log: Logger
    /** Set by middleware/02.auth.ts on every non-public /api request. */
    user?: SessionUser
  }
}

export {}
