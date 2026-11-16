import type { LlmProvider, LlmSettings } from './llm.types'
import { createGeminiProvider } from './providers/gemini.provider'
import { createGroqProvider } from './providers/groq.provider'
import { createOllamaProvider } from './providers/ollama.provider'

// To add a provider: write providers/<name>.provider.ts, add its settings type to LlmSettings,
// a case here, and its env keys in config/load-config.ts (and KEY_PROVIDERS if HRs bring their own key).

/** Builds a provider from explicit settings: from config (the server default) or from an HR's own key. */
export const createLlm = (settings: LlmSettings): LlmProvider => {
  switch (settings.provider) {
    case 'ollama':
      return createOllamaProvider(settings)
    case 'groq':
      return createGroqProvider(settings)
    case 'gemini':
      return createGeminiProvider(settings)
  }
}
