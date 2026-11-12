import { LlmError, type LlmProvider, type OllamaSettings } from '../llm.types'
import { postJson } from './http'

/** A local or self-hosted Ollama server, using /api/generate in JSON mode. */
export const createOllamaProvider = (settings: Omit<OllamaSettings, 'provider'>): LlmProvider => ({
  name: 'ollama',
  model: settings.model,

  async generateJson(prompt) {
    const data = await postJson('ollama', `${settings.baseUrl}/api/generate`, {
      model: settings.model,
      prompt,
      stream: false,
      format: 'json'
    }, { timeoutMs: settings.timeoutMs })

    if (typeof data?.response !== 'string') throw new LlmError('ollama', 'response had no text')
    return data.response
  }
})
