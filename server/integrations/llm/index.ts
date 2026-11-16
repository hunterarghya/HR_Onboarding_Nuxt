import { config } from '~~/server/config/env'
import type { AppConfig } from '~~/server/config/load-config'
import { createLlm } from './llm.registry'
import type { LlmProvider, LlmSettings } from './llm.types'

export { createLlm } from './llm.registry'
export { KEY_PROVIDERS, LlmError, PROVIDER_LABELS, type KeyProviderName, type LlmProvider, type LlmProviderName, type LlmSettings } from './llm.types'

/** Maps the LLM part of the app config to the selected provider's settings. */
export const settingsFromConfig = (llm: AppConfig['llm']): LlmSettings => {
  if (llm.provider === 'groq') {
    // load-config guarantees both when LLM_PROVIDER=groq
    return { provider: 'groq', apiKey: llm.groq.apiKey!, model: llm.groq.model!, baseUrl: llm.groq.baseUrl, timeoutMs: llm.timeoutMs }
  }
  if (llm.provider === 'gemini') {
    return { provider: 'gemini', apiKey: llm.gemini.apiKey!, model: llm.gemini.model, baseUrl: llm.gemini.baseUrl, timeoutMs: llm.timeoutMs }
  }
  return { provider: 'ollama', baseUrl: llm.ollama.baseUrl, model: llm.ollama.model, timeoutMs: llm.timeoutMs }
}

let llm: LlmProvider | null = null

/** Settings for an HR's own key (base URLs follow the server's, so proxies and tests apply to them too). */
export const settingsForKey = (provider: 'groq' | 'gemini', apiKey: string, model: string, llmConfig: AppConfig['llm'] = config.llm): LlmSettings =>
  ({ provider, apiKey, model, baseUrl: llmConfig[provider].baseUrl, timeoutMs: llmConfig.timeoutMs })

/** The server's default provider (LLM_PROVIDER), used by HRs who haven't plugged in their own key. */
export const getLlm = (): LlmProvider => {
  llm ??= createLlm(settingsFromConfig(config.llm))
  return llm
}
