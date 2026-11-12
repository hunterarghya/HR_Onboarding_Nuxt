import { LlmError, type GroqSettings, type LlmProvider } from '../llm.types'
import { postJson } from './http'

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'

/**
 * Groq's hosted models through its OpenAI-compatible chat completions API, in JSON mode.
 * Needs GROQ_API_KEY and GROQ_MODEL. Groq requires the word "JSON" in the prompt for JSON mode;
 * every agent prompt asks for JSON output.
 */
export const createGroqProvider = (settings: Omit<GroqSettings, 'provider'>): LlmProvider => ({
  name: 'groq',
  model: settings.model,

  async generateJson(prompt) {
    const data = await postJson('groq', `${settings.baseUrl ?? GROQ_BASE_URL}/chat/completions`, {
      model: settings.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0
    }, {
      timeoutMs: settings.timeoutMs,
      headers: { authorization: `Bearer ${settings.apiKey}` }
    })

    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new LlmError('groq', 'response had no message content')
    return content
  }
})
