import { z } from 'zod'

/** "a@x.com, B@Y.com" → ['a@x.com', 'b@y.com'] */
const list = (value: string | undefined) => (value ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

// Each key is added by the commit that first reads it, so this schema never lists unused settings.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // all: web + task workers + WhatsApp in one process. web: HTTP only (enqueues). worker: workers + WhatsApp.
  APP_ROLE: z.enum(['all', 'web', 'worker']).default('all'),

  DATABASE_URL: z.url(),
  // Background task queues (BullMQ). A path selects the Redis database, e.g. redis://localhost:6379/0
  REDIS_URL: z.url().default('redis://localhost:6379'),
  // Pause between two emails of a bulk send, to stay well inside Gmail's sending limits
  MAIL_SEND_INTERVAL_MS: z.coerce.number().int().min(0).default(200),
  // First retry delay of a failed background task; each further retry waits twice as long
  TASK_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(5_000),

  JWT_SECRET: z.string().min(32, 'must be at least 32 characters (e.g. `openssl rand -hex 32`)'),
  // Encrypts Google tokens at rest. Changing it makes stored tokens unreadable (users sign in again).
  TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32 bytes, e.g. `openssl rand -hex 32`)'),

  // Who may sign in (SEC-05). Comma-separated; at least one of the two must be set.
  ALLOWED_EMAIL_DOMAINS: z.string().optional(),
  ALLOWED_EMAILS: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.url(),

  // Which LLM the agents use (ADR-12). Only the selected provider's settings are required.
  LLM_PROVIDER: z.enum(['ollama', 'groq']).default('ollama'),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  OLLAMA_BASE_URL: z.url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('phi3'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().optional(),

  QDRANT_URL: z.url().default('http://localhost:6333'),

  IMAGEKIT_PUBLIC_KEY: z.string().min(1),
  IMAGEKIT_PRIVATE_KEY: z.string().min(1),
  IMAGEKIT_URL_ENDPOINT: z.url(),

  PUPPETEER_EXECUTABLE_PATH: z.string().optional()
}).superRefine((env, ctx) => {
  if (!list(env.ALLOWED_EMAIL_DOMAINS).length && !list(env.ALLOWED_EMAILS).length) {
    ctx.addIssue({ code: 'custom', path: ['ALLOWED_EMAILS'], message: 'set ALLOWED_EMAILS and/or ALLOWED_EMAIL_DOMAINS: without them anyone with a Google account could sign in' })
  }
  if (env.LLM_PROVIDER === 'groq') {
    if (!env.GROQ_API_KEY) ctx.addIssue({ code: 'custom', path: ['GROQ_API_KEY'], message: 'required when LLM_PROVIDER=groq' })
    if (!env.GROQ_MODEL) ctx.addIssue({ code: 'custom', path: ['GROQ_MODEL'], message: 'required when LLM_PROVIDER=groq' })
  }
})

export class ConfigError extends Error {}

/** Validates an env-like record and shapes it into the app config. Pure, so it can be unit-tested. */
export const loadConfig = (source: Record<string, string | undefined>) => {
  // `KEY=` in a .env file means "not set", so empty values fall back to defaults or fail as missing
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''))

  const parsed = EnvSchema.safeParse(cleaned)
  if (!parsed.success) {
    throw new ConfigError(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`)
  }
  const env = parsed.data

  return Object.freeze({
    env: env.NODE_ENV,
    app: { role: env.APP_ROLE },
    redis: { url: env.REDIS_URL },
    tasks: { retryDelayMs: env.TASK_RETRY_DELAY_MS },
    mail: { sendIntervalMs: env.MAIL_SEND_INTERVAL_MS },
    db: { url: env.DATABASE_URL },
    auth: {
      jwtSecret: env.JWT_SECRET,
      tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
      allowlist: { domains: list(env.ALLOWED_EMAIL_DOMAINS), emails: list(env.ALLOWED_EMAILS) }
    },
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_REDIRECT_URI },
    llm: {
      provider: env.LLM_PROVIDER,
      timeoutMs: env.LLM_TIMEOUT_MS,
      ollama: { baseUrl: env.OLLAMA_BASE_URL, model: env.OLLAMA_MODEL },
      groq: { apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL }
    },
    qdrant: { url: env.QDRANT_URL, collection: 'job_descriptions', vectorSize: 384 },
    imagekit: { publicKey: env.IMAGEKIT_PUBLIC_KEY, privateKey: env.IMAGEKIT_PRIVATE_KEY, urlEndpoint: env.IMAGEKIT_URL_ENDPOINT },
    whatsapp: { executablePath: env.PUPPETEER_EXECUTABLE_PATH }
  })
}

export type AppConfig = ReturnType<typeof loadConfig>
