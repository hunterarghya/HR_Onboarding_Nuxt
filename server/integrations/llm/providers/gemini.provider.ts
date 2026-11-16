import { LlmError, type GeminiSettings, type LlmProvider } from '../llm.types'
import { getJson, postJson } from './http'

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

interface GenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> }, finishReason?: string }>
  promptFeedback?: { blockReason?: string }
}

/**
 * Google's Gemini models through the Generative Language API, in JSON mode
 * (responseMimeType: application/json). The key goes in the x-goog-api-key header, never the URL.
 */
export const createGeminiProvider = (settings: Omit<GeminiSettings, 'provider'>): LlmProvider => {
  const base = settings.baseUrl ?? GEMINI_BASE_URL
  const headers = { 'x-goog-api-key': settings.apiKey }

  return {
    name: 'gemini',
    model: settings.model,

    async generateJson(prompt) {
      const data = await postJson<GenerateContentResponse | null>('gemini', `${base}/models/${encodeURIComponent(settings.model)}:generateContent`, {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 }
      }, { timeoutMs: settings.timeoutMs, headers })

      if (data?.promptFeedback?.blockReason) {
        throw new LlmError('gemini', `prompt blocked (${data.promptFeedback.blockReason})`, undefined, { kind: 'bad_response' })
      }
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(t => typeof t === 'string').join('')
      if (!text) throw new LlmError('gemini', 'response had no text', undefined, { kind: 'bad_response' })
      return text
    },

    async ping(timeoutMs) {
      await getJson('gemini', `${base}/models/${encodeURIComponent(settings.model)}`, { timeoutMs, headers })
    },

    async listModels(timeoutMs) {
      const data = await getJson<{ models?: Array<{ name: string, supportedGenerationMethods?: string[] }> }>('gemini', `${base}/models?pageSize=200`, { timeoutMs, headers })
      return (data.models ?? [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''))
        .filter(name => /^gemini/.test(name) && !/image|tts|audio|live|embedding|computer-use/.test(name))
        .sort()
    }
  }
}
