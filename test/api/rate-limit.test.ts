import { Redis } from 'ioredis'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { createRateLimitClient, hitRateLimit, rateRuleFor, TooManyRequestsError, type RateRule } from '../../server/core/http/rate-limit'
import { api } from './helpers/http'
import { userToken } from './helpers/auth'
import { TEST_REDIS_URL } from './setup/test-env'

// Request limits (SEC-12): which routes are limited, and the counter itself, against the test Redis.
vi.mock('~~/server/config/env', () => ({ config: { redis: { url: 'redis://127.0.0.1:9' } } }))

const redis = new Redis(TEST_REDIS_URL)
afterAll(() => redis.quit())

describe('rateRuleFor', () => {
  it.each([
    ['GET', '/api/auth/google', 'auth'],
    ['GET', '/auth/google/callback?code=x', 'auth'],
    ['POST', '/api/candidates/scan', 'tasks'],
    ['POST', '/api/candidates/scan-mail', 'tasks'],
    ['POST', '/api/candidates/scan-forms', 'tasks'],
    ['POST', '/api/interviews/sync-calendar', 'tasks'],
    ['POST', '/api/mail/offer-letters', 'tasks'],
    ['POST', '/api/interviews/webhook', 'webhook'],
    ['GET', '/api/candidates', null],
    ['GET', '/api/candidates/scan-status', null]
  ])('%s %s → %s', (method, path, name) => {
    expect(rateRuleFor(method, path)?.name ?? null).toBe(name)
  })
})

describe('hitRateLimit', () => {
  const rule: RateRule = { name: `test-${Date.now()}`, limit: 3, windowSeconds: 60, per: 'user' }

  it('lets the limit through, then refuses with how long to wait', async () => {
    for (let i = 0; i < 3; i++) await hitRateLimit(rule, 'user-1', redis)
    const refused = await hitRateLimit(rule, 'user-1', redis).catch(e => e)
    expect(refused).toBeInstanceOf(TooManyRequestsError)
    expect(refused.statusCode).toBe(429)
    expect(refused.retryAfterSeconds).toBeGreaterThan(0)
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it('counts each user (or address) separately', async () => {
    await expect(hitRateLimit(rule, 'user-2', redis)).resolves.toBeUndefined()
  })

  it('counts the very first request on a new connection (it used to be let through uncounted)', async () => {
    const fresh = createRateLimitClient(TEST_REDIS_URL)
    try {
      await expect(hitRateLimit({ ...rule, name: `first-${Date.now()}`, limit: 0 }, 'user-4', fresh)).rejects.toBeInstanceOf(TooManyRequestsError)
    } finally {
      await fresh.quit()
    }
  })

  it('lets requests through when Redis is down, within about a second', async () => {
    const down = createRateLimitClient('redis://127.0.0.1:9')
    const started = Date.now()
    await expect(hitRateLimit({ ...rule, limit: 0 }, 'user-5', down)).resolves.toBeUndefined()
    expect(Date.now() - started).toBeLessThan(3_000)
    down.disconnect()
  })

  it('lets requests through when Redis is down', async () => {
    const down = new Redis('redis://127.0.0.1:9', { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0 })
    await expect(hitRateLimit({ ...rule, limit: 0 }, 'user-3', down)).resolves.toBeUndefined()
    down.disconnect()
  })
})

describe('the running server', () => {
  it('counts limited routes without getting in the way of normal use', async () => {
    const res = await api('GET', '/api/candidates/scan-status', { token: userToken() })
    expect(res.status).toBe(200)
  })
})
