// The LLM transport contract (ADR-12). Agents depend only on LlmProvider, so switching provider,
// model or API key never touches agent code.

export type LlmProviderName = 'ollama' | 'groq'

export interface LlmProvider {
  readonly name: LlmProviderName
  readonly model: string
  /** Sends `prompt` in the provider's JSON mode and returns the raw JSON text the model produced. */
  generateJson(prompt: string): Promise<string>
  /** Cheap reachability/credentials check for the health endpoint; throws LlmError if unusable. */
  ping(timeoutMs: number): Promise<void>
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

/** Everything needed to build a provider: from config today, or from a user's own key later. */
export type LlmSettings = OllamaSettings | GroqSettings

export class LlmError extends Error {
  constructor(
    public readonly provider: LlmProviderName,
    message: string,
    public readonly status?: number,
    options?: { cause?: unknown }
  ) {
    super(`[${provider}] ${message}`, options)
    this.name = 'LlmError'
  }
}
