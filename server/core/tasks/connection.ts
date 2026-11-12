import type { ConnectionOptions } from 'bullmq'
import { config } from '~~/server/config/env'

/**
 * BullMQ connection settings from REDIS_URL (redis[s]://[user:password@]host:port[/db]).
 * Each Queue and Worker opens its own connection from these options.
 * maxRetriesPerRequest: null is what BullMQ requires for workers: a blocked Redis command waits
 * for Redis to come back instead of failing the worker.
 */
export const redisConnection = (): ConnectionOptions => {
  const url = new URL(config.redis.url)
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null
  }
}
