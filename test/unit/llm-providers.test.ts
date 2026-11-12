import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLlm } from '../../server/integrations/llm/llm.registry'
import { LlmError } from '../../server/integrations/llm/llm.types'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const mockFetch = (impl: (url: string, init: RequestInit) => Promise<Response> | Response) => {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const ollama = createLlm({ provider: 'ollama', baseUrl: 'http://ollama.test', model: 'phi3', timeoutMs: 1000 })
const groq = createLlm({ provider: 'groq', apiKey: 'gsk_test', model: 'llama-3.3-70b-versatile', timeoutMs: 1000 })

describe('createLlm', () => {
  it('builds the provider named in the settings', () => {
    expect([ollama.name, ollama.model]).toEqual(['ollama', 'phi3'])
    expect([groq.name, groq.model]).toEqual(['groq', 'llama-3.3-70b-versatile'])
  })
})

describe('ollama provider', () => {
  it('calls /api/generate in JSON mode and returns the response text', async () => {
    const fetchFn = mockFetch(() => jsonResponse({ response: '{"isApplication":true}' }))
    await expect(ollama.generateJson('Return JSON')).resolves.toBe('{"isApplication":true}')

    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('http://ollama.test/api/generate')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ model: 'phi3', prompt: 'Return JSON', stream: false, format: 'json' })
  })

  it('turns HTTP errors into LlmError with the status', async () => {
    mockFetch(() => new Response('model "phi3" not found', { status: 404 }))
    const err = await ollama.generateJson('x').catch(e => e)
    expect(err).toBeInstanceOf(LlmError)
    expect(err).toMatchObject({ provider: 'ollama', status: 404 })
    expect(err.message).toContain('model "phi3" not found')
  })

  it('turns network failures into LlmError', async () => {
    mockFetch(() => Promise.reject(new TypeError('fetch failed')))
    await expect(ollama.generateJson('x')).rejects.toThrow(/\[ollama\] request failed: fetch failed/)
  })

  it('times out instead of waiting forever', async () => {
    mockFetch((_url, init) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason))
    }))
    const fast = createLlm({ provider: 'ollama', baseUrl: 'http://ollama.test', model: 'phi3', timeoutMs: 20 })
    await expect(fast.generateJson('x')).rejects.toThrow(/timed out after 20 ms/)
  })

  it('rejects a reply without text', async () => {
    mockFetch(() => jsonResponse({ done: true }))
    await expect(ollama.generateJson('x')).rejects.toThrow(LlmError)
  })
})

describe('groq provider', () => {
  it('calls chat completions with the API key, JSON mode and temperature 0', async () => {
    const fetchFn = mockFetch(() => jsonResponse({ choices: [{ message: { content: '{"is_activity":false}' } }] }))
    await expect(groq.generateJson('Return JSON')).resolves.toBe('{"is_activity":false}')

    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer gsk_test')
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'Return JSON' }],
      response_format: { type: 'json_object' },
      temperature: 0
    })
  })

  it('honours a custom base URL', async () => {
    const fetchFn = mockFetch(() => jsonResponse({ choices: [{ message: { content: '{}' } }] }))
    await createLlm({ provider: 'groq', apiKey: 'k', model: 'm', baseUrl: 'http://proxy.test/v1', timeoutMs: 1000 }).generateJson('JSON')
    expect(fetchFn.mock.calls[0]![0]).toBe('http://proxy.test/v1/chat/completions')
  })

  it('reports a bad key as LlmError 401', async () => {
    mockFetch(() => jsonResponse({ error: { message: 'Invalid API Key' } }, 401))
    await expect(groq.generateJson('x')).rejects.toMatchObject({ provider: 'groq', status: 401 })
  })

  it('rejects a reply without message content', async () => {
    mockFetch(() => jsonResponse({ choices: [] }))
    await expect(groq.generateJson('x')).rejects.toThrow(/no message content/)
  })
})
