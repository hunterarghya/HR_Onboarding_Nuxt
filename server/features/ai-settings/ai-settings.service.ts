import { config } from '~~/server/config/env'
import { decrypt, encrypt } from '~~/server/core/crypto'
import { AppError, ValidationError } from '~~/server/core/errors/app-error'
import { createLlm, getLlm, LlmError, PROVIDER_LABELS, settingsForKey, type KeyProviderName, type LlmProvider } from '~~/server/integrations/llm'
import type { SaveKeyInput } from './ai-settings.dto'
import { aiSettingsRepository, type LlmKeyRow } from './ai-settings.repository'

// Each HR can plug in their own Groq or Gemini key, and swap it when it runs out. Scans and calendar
// syncs then use that HR's key; HRs without one use the server's default (LLM_PROVIDER).

const CHECK_TIMEOUT_MS = 10_000

/**
 * Suggested model per provider (the HR can choose any model their key offers). Stable model names, not
 * "-latest" aliases: those follow the newest model, which Google sometimes has to turn away (503).
 */
export const DEFAULT_MODELS: Record<KeyProviderName, string> = { groq: 'openai/gpt-oss-20b', gemini: 'gemini-2.5-flash' }

const KEY_PAGES: Record<KeyProviderName, string> = {
  groq: 'https://console.groq.com/keys',
  gemini: 'https://aistudio.google.com/apikey'
}

const keyHint = (apiKey: string) => `…${apiKey.slice(-4)}`

const providerFor = (provider: KeyProviderName, apiKey: string, model: string): LlmProvider =>
  createLlm(settingsForKey(provider, apiKey, model))

const fromRow = (row: LlmKeyRow) => providerFor(row.provider, decrypt(row.api_key_encrypted, config.auth.tokenEncryptionKey), row.model)

/** A provider's refusal as a 400 the settings page can show. */
const refused = (provider: KeyProviderName, err: unknown): AppError => {
  const name = PROVIDER_LABELS[provider]
  if (err instanceof LlmError) {
    if (err.kind === 'auth') return new ValidationError([{ path: ['apiKey'], message: `${name} refused this key` }], `${name} refused this API key`)
    if (err.kind === 'quota') return new ValidationError([{ path: ['apiKey'], message: `${name} says this key has reached its limit` }], `This ${name} key has reached its rate or usage limit`)
    if (err.status === 404) return new ValidationError([{ path: ['model'], message: `${name} has no model by that name for this key` }], `${name} doesn't offer that model to this key`)
  }
  return new AppError(502, 'LLM_UNREACHABLE', `Couldn't reach ${name} to check the key. Try again in a moment.`)
}

export const aiSettingsService = {
  /** What the settings page shows. API keys never leave the server, only their last characters. */
  async get(userId: number) {
    const [keys, active] = await Promise.all([aiSettingsRepository.findKeys(userId), aiSettingsRepository.getActive(userId)])
    const server = getLlm()
    return {
      active: active ?? 'server',
      server: { provider: server.name, label: PROVIDER_LABELS[server.name], model: server.model },
      providers: (['groq', 'gemini'] as const).map((provider) => {
        const key = keys.find(k => k.provider === provider)
        return {
          provider,
          label: PROVIDER_LABELS[provider],
          keyPage: KEY_PAGES[provider],
          defaultModel: DEFAULT_MODELS[provider],
          key: key ? { hint: key.key_hint, model: key.model, updatedAt: key.updated_at } : null
        }
      })
    }
  },

  /**
   * Plugs in or replaces a key (and/or changes the model). The key and model are checked with the
   * provider first, so a mistyped or used-up key is caught here, not in the middle of a scan.
   * Saving a key also makes it the one in use: that's the "swap the key" flow.
   */
  async saveKey(userId: number, provider: KeyProviderName, input: SaveKeyInput) {
    const existing = await aiSettingsRepository.findKey(userId, provider)
    if (!input.apiKey && !existing) {
      throw new ValidationError([{ path: ['apiKey'], message: 'required' }], `Add a ${PROVIDER_LABELS[provider]} API key first`)
    }
    const apiKey = input.apiKey ?? decrypt(existing!.api_key_encrypted, config.auth.tokenEncryptionKey)
    const model = input.model ?? existing?.model ?? DEFAULT_MODELS[provider]

    try {
      await providerFor(provider, apiKey, model).ping(CHECK_TIMEOUT_MS)
    } catch (err) {
      throw refused(provider, err)
    }

    await aiSettingsRepository.upsertKey({
      user_id: userId,
      provider,
      api_key_encrypted: encrypt(apiKey, config.auth.tokenEncryptionKey),
      key_hint: keyHint(apiKey),
      model
    })
    if (input.apiKey) await aiSettingsRepository.setActive(userId, provider)
    return this.get(userId)
  },

  async removeKey(userId: number, provider: KeyProviderName) {
    await aiSettingsRepository.deleteKey(userId, provider)
    if (await aiSettingsRepository.getActive(userId) === provider) await aiSettingsRepository.setActive(userId, null)
    return this.get(userId)
  },

  async setActive(userId: number, provider: KeyProviderName | 'server') {
    if (provider !== 'server' && !(await aiSettingsRepository.findKey(userId, provider))) {
      throw new ValidationError([{ path: ['provider'], message: 'no key' }], `Add a ${PROVIDER_LABELS[provider]} API key first`)
    }
    await aiSettingsRepository.setActive(userId, provider === 'server' ? null : provider)
    return this.get(userId)
  },

  /** Models a provider offers, with the key given now or the one already saved. */
  async listModels(userId: number, provider: KeyProviderName, apiKey?: string) {
    const existing = apiKey ? null : await aiSettingsRepository.findKey(userId, provider)
    if (!apiKey && !existing) throw new ValidationError([{ path: ['apiKey'], message: 'required' }], `Enter a ${PROVIDER_LABELS[provider]} API key first`)
    const llm = apiKey ? providerFor(provider, apiKey, DEFAULT_MODELS[provider]) : fromRow(existing!)
    try {
      return { models: await llm.listModels(CHECK_TIMEOUT_MS) }
    } catch (err) {
      throw refused(provider, err)
    }
  },

  /** Asks the AI in use one small question: "is it working right now?" */
  async test(userId: number) {
    const llm = await this.llmFor(userId)
    const started = Date.now()
    try {
      const reply = await llm.generateJson('Reply with this JSON and nothing else: {"ok": true}')
      return { ok: true, provider: llm.name, label: PROVIDER_LABELS[llm.name], model: llm.model, ms: Date.now() - started, reply: reply.slice(0, 200) }
    } catch (err) {
      return {
        ok: false,
        provider: llm.name,
        label: PROVIDER_LABELS[llm.name],
        model: llm.model,
        ms: Date.now() - started,
        reply: null,
        error: err instanceof LlmError ? err.advice : 'The AI model could not be reached'
      }
    }
  },

  /** The AI that work done for this HR should use: their own key if they picked one, else the server's. */
  async llmFor(userId: number): Promise<LlmProvider> {
    const active = await aiSettingsRepository.getActive(userId)
    const row = active ? await aiSettingsRepository.findKey(userId, active) : null
    return row ? fromRow(row) : getLlm()
  }
}
