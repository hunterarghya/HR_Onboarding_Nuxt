import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../../server/config/load-config'

const validEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/hr_onboarding',
  JWT_SECRET: 'x'.repeat(32),
  TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32),
  ALLOWED_EMAIL_DOMAINS: 'example.com',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:3001/auth/google/callback',
  IMAGEKIT_PUBLIC_KEY: 'public',
  IMAGEKIT_PRIVATE_KEY: 'private',
  IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/demo'
}

describe('loadConfig', () => {
  it('shapes a valid env and applies defaults', () => {
    const config = loadConfig(validEnv)
    expect(config.auth.jwtSecret).toBe('x'.repeat(32))
    expect(config.google.redirectUri).toBe(validEnv.GOOGLE_REDIRECT_URI)
    expect(config.llm).toEqual({ provider: 'ollama', timeoutMs: 120_000, ollama: { baseUrl: 'http://localhost:11434', model: 'phi3' }, groq: { apiKey: undefined, model: undefined } })
    expect(config.qdrant.url).toBe('http://localhost:6333')
    expect(config.whatsapp.executablePath).toBeUndefined()
    expect(Object.isFrozen(config)).toBe(true)
  })

  it('treats empty values as unset', () => {
    const config = loadConfig({ ...validEnv, OLLAMA_MODEL: '', PUPPETEER_EXECUTABLE_PATH: '' })
    expect(config.llm.ollama.model).toBe('phi3')
    expect(config.whatsapp.executablePath).toBeUndefined()
  })

  it('rejects a short JWT secret with a clear message', () => {
    expect(() => loadConfig({ ...validEnv, JWT_SECRET: 'secret' })).toThrow(ConfigError)
    expect(() => loadConfig({ ...validEnv, JWT_SECRET: 'secret' })).toThrow(/at least 32 characters[\s\S]*JWT_SECRET/)
  })

  it.each(['DATABASE_URL', 'JWT_SECRET', 'TOKEN_ENCRYPTION_KEY', 'GOOGLE_CLIENT_ID', 'IMAGEKIT_PUBLIC_KEY'])('requires %s', (key) => {
    const env: Record<string, string | undefined> = { ...validEnv, [key]: undefined }
    expect(() => loadConfig(env)).toThrow(new RegExp(key))
  })

  it('needs Groq key and model only when Groq is the selected provider', () => {
    expect(() => loadConfig({ ...validEnv, LLM_PROVIDER: 'groq' })).toThrow(/GROQ_API_KEY[\s\S]*GROQ_MODEL|GROQ_MODEL[\s\S]*GROQ_API_KEY/)
    const config = loadConfig({ ...validEnv, LLM_PROVIDER: 'groq', GROQ_API_KEY: 'gsk_test', GROQ_MODEL: 'llama-3.3-70b-versatile', LLM_TIMEOUT_MS: '5000' })
    expect(config.llm).toMatchObject({ provider: 'groq', timeoutMs: 5000, groq: { apiKey: 'gsk_test', model: 'llama-3.3-70b-versatile' } })
    expect(loadConfig({ ...validEnv, GROQ_API_KEY: '' }).llm.provider).toBe('ollama')
  })

  it('requires a login allowlist and normalises it', () => {
    expect(() => loadConfig({ ...validEnv, ALLOWED_EMAIL_DOMAINS: undefined })).toThrow(/ALLOWED_EMAILS/)
    expect(() => loadConfig({ ...validEnv, ALLOWED_EMAIL_DOMAINS: ' , ' })).toThrow(/ALLOWED_EMAILS/)
    const config = loadConfig({ ...validEnv, ALLOWED_EMAIL_DOMAINS: 'Ripplewalk.com, ', ALLOWED_EMAILS: ' Lead@Gmail.com' })
    expect(config.auth.allowlist).toEqual({ domains: ['ripplewalk.com'], emails: ['lead@gmail.com'] })
  })

  it('rejects an unknown LLM provider', () => {
    expect(() => loadConfig({ ...validEnv, LLM_PROVIDER: 'gpt' })).toThrow(/LLM_PROVIDER/)
  })

  it('rejects malformed URLs', () => {
    expect(() => loadConfig({ ...validEnv, QDRANT_URL: 'not a url' })).toThrow(/QDRANT_URL/)
  })
})
