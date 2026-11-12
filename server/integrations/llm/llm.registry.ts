import type { LlmProvider, LlmSettings } from './llm.types'
import { createGroqProvider } from './providers/groq.provider'
import { createOllamaProvider } from './providers/ollama.provider'

// To add a provider (e.g. Gemini): write providers/<name>.provider.ts, add its settings type to
// LlmSettings, a case here, and its env keys in config/load-config.ts.

/** Builds a provider from explicit settings: from config today, from a user's own key later. */
export const createLlm = (settings: LlmSettings): LlmProvider => {
  switch (settings.provider) {
    case 'ollama':
      return createOllamaProvider(settings)
    case 'groq':
      return createGroqProvider(settings)
  }
}
