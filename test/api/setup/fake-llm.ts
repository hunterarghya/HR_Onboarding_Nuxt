// A stand-in for Groq's and Gemini's APIs, so the smoke suite can plug keys in and swap them without
// the internet. The server under test is pointed here with GROQ_BASE_URL / GEMINI_BASE_URL.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/** Works with both providers. */
export const GOOD_KEY = 'good-key-0000000001'
/** A second working key, for "swap the key". */
export const OTHER_GOOD_KEY = 'good-key-0000000002'
/** Accepted, but over its limit: 429 on every call. */
export const USED_UP_KEY = 'used-up-key-00000003'

const GROQ_MODELS = ['openai/gpt-oss-20b', 'llama-3.1-8b-instant', 'whisper-large-v3']
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-embedding-001']

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

const handleGroq = (req: IncomingMessage, res: ServerResponse, path: string, key: string) => {
  if (key === USED_UP_KEY) return send(res, 429, { error: { message: 'Rate limit reached', type: 'tokens', code: 'rate_limit_exceeded' } })
  if (!key.startsWith('good-key')) return send(res, 401, { error: { message: 'Invalid API Key', code: 'invalid_api_key' } })
  if (path === '/models') return send(res, 200, { data: GROQ_MODELS.map(id => ({ id, active: true })) })
  if (path === '/chat/completions') return send(res, 200, { choices: [{ message: { content: '{"ok": true, "provider": "groq"}' } }] })
  send(res, 404, { error: { message: 'not found' } })
}

const handleGemini = (req: IncomingMessage, res: ServerResponse, path: string, key: string) => {
  if (key === USED_UP_KEY) return send(res, 429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } })
  if (!key.startsWith('good-key')) return send(res, 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } })
  if (path === '/models') {
    return send(res, 200, { models: GEMINI_MODELS.map(m => ({ name: `models/${m}`, supportedGenerationMethods: m.includes('embedding') ? ['embedContent'] : ['generateContent'] })) })
  }
  const match = path.match(/^\/models\/([^:]+)(:generateContent)?$/)
  if (!match || !GEMINI_MODELS.includes(decodeURIComponent(match[1]!))) return send(res, 404, { error: { code: 404, status: 'NOT_FOUND', message: 'model not found' } })
  if (!match[2]) return send(res, 200, { name: `models/${match[1]}` })
  send(res, 200, { candidates: [{ content: { parts: [{ text: '{"ok": true, "provider": "gemini"}' }] } }] })
}

/** Starts the fake on a free port; returns the two base URLs and a stop function. */
export const startFakeLlm = async () => {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake')
    if (url.pathname.startsWith('/groq')) {
      return handleGroq(req, res, url.pathname.slice('/groq'.length), (req.headers.authorization ?? '').replace(/^Bearer /, ''))
    }
    if (url.pathname.startsWith('/gemini')) {
      return handleGemini(req, res, url.pathname.slice('/gemini'.length), String(req.headers['x-goog-api-key'] ?? ''))
    }
    send(res, 404, {})
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    groqBaseUrl: `${base}/groq`,
    geminiBaseUrl: `${base}/gemini`,
    stop: () => new Promise<void>(resolve => server.close(() => resolve()))
  }
}
