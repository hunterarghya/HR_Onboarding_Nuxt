import type { Logger } from '../core/logger'

declare module 'h3' {
  interface H3EventContext {
    requestId: string
    log: Logger
  }
}

export {}
