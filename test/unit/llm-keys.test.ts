import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyEmail } from '../../server/agents/email-classifier/email-classifier.agent'
import { LlmError, type LlmProvider } from '../../server/integrations/llm'
import { createGeminiProvider } from '../../server/integrations/llm/providers/gemini.provider'
import { errorKind } from '../../server/integrations/llm/providers/http'

vi.spyOn(console, 'error').mockImplementation(() => {})
vi.spyOn(console, 'log').mockImplementation(() => {})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Replaces fetch with one canned answer and records the request */
const fakeFetch = (status: number, body: unknown) => {
  const calls: Array<{ url: string, init: RequestInit }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }))
  return calls
}

describe('errorKind', () => {
  it.each([
    [401, '', 'auth'],
    [400, '{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}', 'auth'],
    [429, '', 'quota'],
    [403, '', 'auth'],
    [400, '{"error":{"status":"RESOURCE_EXHAUSTED"}}', 'quota'],
    [503, '', 'unavailable'],
    [400, 'bad request', 'bad_response']
  ])('HTTP %s %s → %s', (status, body, kind) => {
    expect(errorKind(status, body)).toBe(kind)
  })
})

describe('Gemini provider', () => {
  const gemini = createGeminiProvider({ apiKey: 'AIza-secret-key', model: 'gemini-flash-latest', timeoutMs: 1000 })

  it('asks in JSON mode with the key in a header (never the URL) and returns the text', async () => {
    const calls = fakeFetch(200, { candidates: [{ content: { parts: [{ text: '{"isApplication":' }, { text: ' true}' }] } }] })
    await expect(gemini.generateJson('Is this an application? JSON please')).resolves.toBe('{"isApplication": true}')
    expect(calls[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent')
    expect(calls[0]!.url).not.toContain('AIza')
    expect((calls[0]!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-secret-key')
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ generationConfig: { responseMimeType: 'application/json', temperature: 0 } })
  })

  it('reports a used-up key as quota and a refused one as auth', async () => {
    fakeFetch(429, { error: { status: 'RESOURCE_EXHAUSTED' } })
    await expect(gemini.generateJson('x')).rejects.toMatchObject({ kind: 'quota', needsNewKey: true })
    fakeFetch(400, { error: { details: [{ reason: 'API_KEY_INVALID' }] } })
    await expect(gemini.generateJson('x')).rejects.toMatchObject({ kind: 'auth', needsNewKey: true })
  })

  it('explains an overloaded model in plain words, not raw JSON', async () => {
    fakeFetch(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand.' } })
    const err = await gemini.generateJson('x').catch(e => e)
    expect(err).toMatchObject({ kind: 'unavailable', needsNewKey: false })
    expect(err.advice).toBe('Gemini is busy or can\'t be reached right now (HTTP 503). Try again shortly, or pick another model in Settings → AI model.')
  })

  it('treats an empty or blocked answer as a bad response', async () => {
    fakeFetch(200, { promptFeedback: { blockReason: 'SAFETY' } })
    await expect(gemini.generateJson('x')).rejects.toMatchObject({ kind: 'bad_response', needsNewKey: false })
  })

  it('lists only text models', async () => {
    fakeFetch(200, { models: [
      { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] }
    ] })
    await expect(gemini.listModels(1000)).resolves.toEqual(['gemini-flash-latest'])
  })
})

describe('a key that runs out in the middle of a scan', () => {
  const failing = (kind: 'quota' | 'auth' | 'unavailable'): LlmProvider => ({
    name: 'groq',
    model: 'm',
    ping: async () => {},
    listModels: async () => [],
    generateJson: async () => {
      throw new LlmError('groq', 'HTTP 429', 429, { kind })
    }
  })

  it('stops the scan with advice instead of treating every email as "not an application"', async () => {
    await expect(classifyEmail('Application', 'resume attached', failing('quota')))
      .rejects.toMatchObject({ advice: expect.stringContaining('Swap in another key in Settings → AI model') })
    await expect(classifyEmail('Application', 'resume attached', failing('auth'))).rejects.toMatchObject({ kind: 'auth' })
  })

  it('still counts a passing outage as "not an application" for that email', async () => {
    await expect(classifyEmail('Application', 'resume attached', failing('unavailable'))).resolves.toEqual({ isApplication: false, position: null })
  })
})
