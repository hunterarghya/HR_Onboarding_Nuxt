import { beforeEach, describe, expect, it } from 'vitest'
import { itRequiresLogin } from './helpers/auth'
import { db } from './helpers/db'
import { api, expectError } from './helpers/http'
import { GOOD_KEY, OTHER_GOOD_KEY, USED_UP_KEY } from './setup/fake-llm'

// Settings → AI model, against the fake Groq / Gemini of setup/fake-llm.ts.

beforeEach(async () => {
  await db().query('DELETE FROM llm_keys')
  await db().query('UPDATE users SET llm_provider = NULL')
})

const saveKey = (provider: string, body: Record<string, unknown>) => api('PUT', `/api/settings/ai/keys/${provider}`, { body })

describe('GET /api/settings/ai', () => {
  itRequiresLogin('GET', '/api/settings/ai')

  it('starts on the server default with no keys', async () => {
    const res = await api('GET', '/api/settings/ai')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      active: 'server',
      server: { provider: 'ollama', label: 'Ollama' },
      providers: [
        { provider: 'groq', label: 'Groq', key: null, defaultModel: 'openai/gpt-oss-20b' },
        { provider: 'gemini', label: 'Gemini', key: null, defaultModel: 'gemini-2.5-flash' }
      ]
    })
  })
})

describe('PUT /api/settings/ai/keys/:provider', () => {
  itRequiresLogin('PUT', '/api/settings/ai/keys/groq', { apiKey: GOOD_KEY })

  it.each(['groq', 'gemini'])('checks a %s key with the provider, stores it encrypted and puts it in use', async (provider) => {
    const res = await saveKey(provider, { apiKey: GOOD_KEY })
    expect(res.status).toBe(200)
    expect(res.body.active).toBe(provider)
    expect(res.body.providers.find((p: { provider: string }) => p.provider === provider).key).toMatchObject({ hint: '…0001' })
    expect(JSON.stringify(res.body)).not.toContain(GOOD_KEY) // never sent back

    const { rows: [row] } = await db().query('SELECT api_key_encrypted, model FROM llm_keys WHERE provider = $1', [provider])
    expect(row.api_key_encrypted).not.toContain(GOOD_KEY)
    expect(row.model).toBe(provider === 'groq' ? 'openai/gpt-oss-20b' : 'gemini-2.5-flash')
  })

  it.each([
    ['groq', 'a refused key', 'not-a-real-key-123', 'Groq refused this API key'],
    ['gemini', 'a refused key (Gemini answers 400 API_KEY_INVALID)', 'not-a-real-key-123', 'Gemini refused this API key'],
    ['gemini', 'a key over its limit', USED_UP_KEY, 'This Gemini key has reached its rate or usage limit']
  ])('%s: refuses %s and keeps nothing (400)', async (provider, _label, apiKey, message) => {
    expectError(await saveKey(provider, { apiKey }), 400, message)
    expect((await db().query('SELECT 1 FROM llm_keys')).rowCount).toBe(0)
  })

  it('refuses a model the key can\'t use (400)', async () => {
    expectError(await saveKey('gemini', { apiKey: GOOD_KEY, model: 'gemini-0.1-retired' }), 400, 'Gemini doesn\'t offer that model to this key')
  })

  it('swaps the key: the new one replaces the old', async () => {
    await saveKey('gemini', { apiKey: GOOD_KEY })
    const res = await saveKey('gemini', { apiKey: OTHER_GOOD_KEY })
    expect(res.body.providers[1].key.hint).toBe('…0002')
    expect((await db().query('SELECT 1 FROM llm_keys')).rowCount).toBe(1)
  })

  it('changes the model without the key being typed again', async () => {
    await saveKey('gemini', { apiKey: GOOD_KEY })
    const res = await saveKey('gemini', { model: 'gemini-flash-latest' })
    expect(res.status).toBe(200)
    expect(res.body.providers[1].key).toMatchObject({ hint: '…0001', model: 'gemini-flash-latest' })
  })

  it.each([
    ['a model change before any key', 'groq', { model: 'openai/gpt-oss-20b' }, 400],
    ['an empty body', 'groq', {}, 400],
    ['a key with spaces', 'groq', { apiKey: 'has spaces in it 123' }, 400],
    ['an unknown provider', 'openai', { apiKey: GOOD_KEY }, 400],
    ['an unknown field', 'groq', { apiKey: GOOD_KEY, org: 'x' }, 400]
  ])('rejects %s', async (_label, provider, body, status) => {
    expectError(await saveKey(provider, body), status)
  })
})

describe('PUT /api/settings/ai/active', () => {
  itRequiresLogin('PUT', '/api/settings/ai/active', { provider: 'server' })

  it('switches between the HR\'s keys and the server default', async () => {
    await saveKey('groq', { apiKey: GOOD_KEY })
    await saveKey('gemini', { apiKey: GOOD_KEY }) // now gemini is in use
    expect((await api('PUT', '/api/settings/ai/active', { body: { provider: 'groq' } })).body.active).toBe('groq')
    expect((await api('PUT', '/api/settings/ai/active', { body: { provider: 'server' } })).body.active).toBe('server')
  })

  it('needs a key for the provider (400)', async () => {
    expectError(await api('PUT', '/api/settings/ai/active', { body: { provider: 'gemini' } }), 400, 'Add a Gemini API key first')
  })
})

describe('DELETE /api/settings/ai/keys/:provider', () => {
  itRequiresLogin('DELETE', '/api/settings/ai/keys/groq')

  it('removes the key and falls back to the server default when it was in use', async () => {
    await saveKey('groq', { apiKey: GOOD_KEY })
    const res = await api('DELETE', '/api/settings/ai/keys/groq')
    expect(res.body).toMatchObject({ active: 'server', providers: [{ provider: 'groq', key: null }, { provider: 'gemini', key: null }] })
  })
})

describe('POST /api/settings/ai/models/:provider', () => {
  itRequiresLogin('POST', '/api/settings/ai/models/groq', {})

  it('lists the text models for a key being typed, or the saved one', async () => {
    const typed = await api('POST', '/api/settings/ai/models/groq', { body: { apiKey: GOOD_KEY } })
    expect(typed.body.models).toEqual(['llama-3.1-8b-instant', 'openai/gpt-oss-20b']) // no speech models
    await saveKey('gemini', { apiKey: GOOD_KEY })
    const saved = await api('POST', '/api/settings/ai/models/gemini', { body: {} })
    expect(saved.body.models).toEqual(['gemini-2.5-flash', 'gemini-flash-latest']) // no embedding models
  })

  it('needs a key (400)', async () => {
    expectError(await api('POST', '/api/settings/ai/models/gemini', { body: {} }), 400, 'Enter a Gemini API key first')
  })
})

describe('POST /api/settings/ai/test', () => {
  itRequiresLogin('POST', '/api/settings/ai/test')

  it('asks the AI in use: the HR\'s own key once one is plugged in', async () => {
    const before = await api('POST', '/api/settings/ai/test')
    expect(before.body).toMatchObject({ ok: false, label: 'Ollama' }) // server default, unreachable in tests

    await saveKey('gemini', { apiKey: GOOD_KEY })
    const after = await api('POST', '/api/settings/ai/test')
    expect(after.body).toMatchObject({ ok: true, label: 'Gemini', model: 'gemini-2.5-flash' })
    expect(after.body.reply).toContain('"provider": "gemini"')
  })

  it('says to swap the key when it has run out', async () => {
    await saveKey('groq', { apiKey: GOOD_KEY })
    // the key runs out after it was saved
    const { rows: [user] } = await db().query('SELECT id FROM users WHERE email = $1', ['smoke.tester@example.com'])
    const { encrypt } = await import('../../server/core/crypto')
    const { TEST_TOKEN_ENCRYPTION_KEY } = await import('./setup/test-env')
    await db().query('UPDATE llm_keys SET api_key_encrypted = $1 WHERE user_id = $2', [encrypt(USED_UP_KEY, TEST_TOKEN_ENCRYPTION_KEY), user.id])

    const res = await api('POST', '/api/settings/ai/test')
    expect(res.body).toMatchObject({ ok: false, label: 'Groq' })
    expect(res.body.error).toMatch(/reached its rate or usage limit\. Swap in another key in Settings → AI model/)
  })
})
