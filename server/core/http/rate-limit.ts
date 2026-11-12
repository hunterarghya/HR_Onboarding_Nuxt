import { Redis } from 'ioredis'
import { config } from '~~/server/config/env'
import { AppError } from '../errors/app-error'

// Fixed-window request limits kept in Redis, so every process (web and worker) shares the same counts
// (SEC-12). Each rule applies to a group of routes and counts per user or per IP address.

export class TooManyRequestsError extends AppError {
  constructor(public readonly retryAfterSeconds: number) {
    super(429, 'TOO_MANY_REQUESTS', 'Too many requests, please try again later')
  }
}

export interface RateRule {
  /** names the counter, e.g. "tasks" */
  name: string
  limit: number
  windowSeconds: number
  per: 'user' | 'ip'
}

/** Which rule (if any) covers a request. */
export const rateRuleFor = (method: string, path: string): RateRule | null => {
  const p = path.split('?')[0]!
  // signing in with Google: someone hammering it from one address
  if (p === '/api/auth/google' || p.startsWith('/auth/google')) return { name: 'auth', limit: 30, windowSeconds: 600, per: 'ip' }
  // Google Calendar push notifications (public)
  if (method === 'POST' && p === '/api/interviews/webhook') return { name: 'webhook', limit: 300, windowSeconds: 60, per: 'ip' }
  // work that reads mailboxes, calls Google or the AI, or sends email: one at a time already, and not too often
  if (method === 'POST' && (
    /^\/api\/candidates\/scan(-mail|-forms)?$/.test(p)
    || p === '/api/interviews/sync-calendar'
    || p === '/api/interviews/register-webhook'
    || p.startsWith('/api/mail/')
  )) return { name: 'tasks', limit: 30, windowSeconds: 600, per: 'user' }
  return null
}

let client: Redis | null = null
const redis = () => {
  client ??= new Redis(config.redis.url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false })
  return client
}

/**
 * Counts one request for `who` under `rule`; throws TooManyRequestsError once the window's limit is
 * passed. If Redis can't be reached the request is let through: a limit isn't worth an outage.
 */
export const hitRateLimit = async (rule: RateRule, who: string, store: Pick<Redis, 'multi'> = redis()) => {
  const window = Math.floor(Date.now() / 1000 / rule.windowSeconds)
  const key = `ratelimit:${rule.name}:${who}:${window}`
  let count: number
  try {
    const results = await store.multi().incr(key).expire(key, rule.windowSeconds).exec()
    count = Number(results?.[0]?.[1] ?? 0)
  } catch (err) {
    console.warn(`[RateLimit] Redis unavailable, not limiting: ${(err as Error).message}`)
    return
  }
  if (count > rule.limit) {
    const retryAfter = rule.windowSeconds - (Math.floor(Date.now() / 1000) % rule.windowSeconds)
    throw new TooManyRequestsError(retryAfter)
  }
}

export const closeRateLimit = async () => {
  await client?.quit().catch(() => {})
  client = null
}
