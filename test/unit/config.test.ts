import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../../server/config/load-config'

const validEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/hr_onboarding',
  JWT_SECRET: 'x'.repeat(32),
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
    expect(config.ollama).toEqual({ baseUrl: 'http://localhost:11434', model: 'phi3' })
    expect(config.qdrant.url).toBe('http://localhost:6333')
    expect(config.whatsapp.executablePath).toBeUndefined()
    expect(Object.isFrozen(config)).toBe(true)
  })

  it('treats empty values as unset', () => {
    const config = loadConfig({ ...validEnv, OLLAMA_MODEL: '', PUPPETEER_EXECUTABLE_PATH: '' })
    expect(config.ollama.model).toBe('phi3')
    expect(config.whatsapp.executablePath).toBeUndefined()
  })

  it('rejects a short JWT secret with a clear message', () => {
    expect(() => loadConfig({ ...validEnv, JWT_SECRET: 'secret' })).toThrow(ConfigError)
    expect(() => loadConfig({ ...validEnv, JWT_SECRET: 'secret' })).toThrow(/at least 32 characters[\s\S]*JWT_SECRET/)
  })

  it.each(['DATABASE_URL', 'JWT_SECRET', 'GOOGLE_CLIENT_ID', 'IMAGEKIT_PUBLIC_KEY'])('requires %s', (key) => {
    const env: Record<string, string | undefined> = { ...validEnv, [key]: undefined }
    expect(() => loadConfig(env)).toThrow(new RegExp(key))
  })

  it('rejects malformed URLs', () => {
    expect(() => loadConfig({ ...validEnv, QDRANT_URL: 'not a url' })).toThrow(/QDRANT_URL/)
  })
})
