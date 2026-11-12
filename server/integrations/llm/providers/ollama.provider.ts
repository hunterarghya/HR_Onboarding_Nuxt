import { LlmError, type LlmProvider, type OllamaSettings } from '../llm.types'
import { getJson, postJson } from './http'

/** A local or self-hosted Ollama server, using /api/generate in JSON mode. */
export const createOllamaProvider = (settings: Omit<OllamaSettings, 'provider'>): LlmProvider => ({
  name: 'ollama',
  model: settings.model,

  async generateJson(prompt) {
    const data = await postJson<{ response?: unknown } | null>('ollama', `${settings.baseUrl}/api/generate`, {
      model: settings.model,
      prompt,
      stream: false,
      format: 'json'
    }, { timeoutMs: settings.timeoutMs })

    if (typeof data?.response !== 'string') throw new LlmError('ollama', 'response had no text')
    return data.response
  },

  async ping(timeoutMs) {
    await getJson('ollama', `${settings.baseUrl}/api/tags`, { timeoutMs })
  }
})
