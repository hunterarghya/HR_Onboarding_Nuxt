import { z } from 'zod'

// Each key is added by the commit that first reads it, so this schema never lists unused settings.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.url(),

  JWT_SECRET: z.string().min(32, 'must be at least 32 characters (e.g. `openssl rand -hex 32`)'),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.url(),

  OLLAMA_BASE_URL: z.url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('phi3'),

  QDRANT_URL: z.url().default('http://localhost:6333'),

  IMAGEKIT_PUBLIC_KEY: z.string().min(1),
  IMAGEKIT_PRIVATE_KEY: z.string().min(1),
  IMAGEKIT_URL_ENDPOINT: z.url(),

  PUPPETEER_EXECUTABLE_PATH: z.string().optional()
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
    db: { url: env.DATABASE_URL },
    auth: { jwtSecret: env.JWT_SECRET },
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_REDIRECT_URI },
    ollama: { baseUrl: env.OLLAMA_BASE_URL, model: env.OLLAMA_MODEL },
    qdrant: { url: env.QDRANT_URL, collection: 'job_descriptions', vectorSize: 384 },
    imagekit: { publicKey: env.IMAGEKIT_PUBLIC_KEY, privateKey: env.IMAGEKIT_PRIVATE_KEY, urlEndpoint: env.IMAGEKIT_URL_ENDPOINT },
    whatsapp: { executablePath: env.PUPPETEER_EXECUTABLE_PATH }
  })
}

export type AppConfig = ReturnType<typeof loadConfig>
