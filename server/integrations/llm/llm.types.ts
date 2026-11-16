// The LLM transport contract (ADR-12). Agents depend only on LlmProvider, so switching provider,
// model or API key never touches agent code.

export type LlmProviderName = 'ollama' | 'groq' | 'gemini'

/** Providers an HR can plug their own API key into (Ollama is a server-side install). */
export const KEY_PROVIDERS = ['groq', 'gemini'] as const
export type KeyProviderName = typeof KEY_PROVIDERS[number]

export const PROVIDER_LABELS: Record<LlmProviderName, string> = { ollama: 'Ollama', groq: 'Groq', gemini: 'Gemini' }

export interface LlmProvider {
  readonly name: LlmProviderName
  readonly model: string
  /** Sends `prompt` in the provider's JSON mode and returns the raw JSON text the model produced. */
  generateJson(prompt: string): Promise<string>
  /** Cheap reachability/credentials check; throws LlmError if unusable (e.g. a refused key). */
  ping(timeoutMs: number): Promise<void>
  /** Text models this provider (and key) can use, for the settings page. */
  listModels(timeoutMs: number): Promise<string[]>
}

export interface OllamaSettings {
  provider: 'ollama'
  baseUrl: string
  model: string
  timeoutMs: number
}

export interface GroqSettings {
  provider: 'groq'
  apiKey: string
  model: string
  /** Defaults to Groq's public API; overridable for proxies or tests. */
  baseUrl?: string
  timeoutMs: number
}

export interface GeminiSettings {
  provider: 'gemini'
  apiKey: string
  model: string
  /** Defaults to Google's Generative Language API; overridable for proxies or tests. */
  baseUrl?: string
  timeoutMs: number
}

/** Everything needed to build a provider: from config, or from an HR's own key. */
export type LlmSettings = OllamaSettings | GroqSettings | GeminiSettings

/**
 * Why a call failed:
 * - auth: the key was refused (wrong, revoked);
 * - quota: rate or usage limit reached, so swap the key or wait;
 * - unavailable: network, timeout or a provider outage;
 * - bad_response: the provider answered with something unusable.
 */
export type LlmErrorKind = 'auth' | 'quota' | 'unavailable' | 'bad_response'

export class LlmError extends Error {
  constructor(
    public readonly provider: LlmProviderName,
    message: string,
    public readonly status?: number,
    options?: { cause?: unknown, kind?: LlmErrorKind }
  ) {
    super(`[${provider}] ${message}`, options)
    this.name = 'LlmError'
    this.kind = options?.kind ?? 'unavailable'
  }

  readonly kind: LlmErrorKind

  /** The HR has to act (swap or fix the key): retrying with the same key won't help. */
  get needsNewKey(): boolean {
    return this.kind === 'auth' || this.kind === 'quota'
  }

  /** A sentence an HR can act on, e.g. in a failed task's message. */
  get advice(): string {
    const name = PROVIDER_LABELS[this.provider]
    if (this.kind === 'auth') return `${name} refused the API key. Add a working key in Settings → AI model.`
    if (this.kind === 'quota') return `The ${name} key has reached its rate or usage limit. Swap in another key in Settings → AI model, or try again later.`
    if (this.kind === 'unavailable') {
      return `${name} is busy or can't be reached right now (${this.status ? `HTTP ${this.status}` : this.message.replace(/^\[\w+\] /, '')}). Try again shortly, or pick another model in Settings → AI model.`
    }
    return this.message
  }
}
