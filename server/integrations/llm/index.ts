import { config } from '~~/server/config/env'
import type { AppConfig } from '~~/server/config/load-config'
import { createLlm } from './llm.registry'
import type { LlmProvider, LlmSettings } from './llm.types'

export { createLlm } from './llm.registry'
export { LlmError, type LlmProvider, type LlmProviderName, type LlmSettings } from './llm.types'

/** Maps the LLM part of the app config to the selected provider's settings. */
export const settingsFromConfig = (llm: AppConfig['llm']): LlmSettings => {
  if (llm.provider === 'groq') {
    // load-config guarantees both when LLM_PROVIDER=groq
    return { provider: 'groq', apiKey: llm.groq.apiKey!, model: llm.groq.model!, timeoutMs: llm.timeoutMs }
  }
  return { provider: 'ollama', baseUrl: llm.ollama.baseUrl, model: llm.ollama.model, timeoutMs: llm.timeoutMs }
}

let llm: LlmProvider | null = null

/** The app-wide provider chosen by LLM_PROVIDER. */
export const getLlm = (): LlmProvider => {
  llm ??= createLlm(settingsFromConfig(config.llm))
  return llm
}
