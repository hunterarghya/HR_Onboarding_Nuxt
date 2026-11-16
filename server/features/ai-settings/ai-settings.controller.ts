import { requireUser } from '~~/server/core/auth/current-user'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody, parseParams } from '~~/server/core/http/validate'
import { ListModelsBody, ProviderParams, SaveKeyBody, SetActiveBody } from './ai-settings.dto'
import { aiSettingsService } from './ai-settings.service'

// Settings → AI model: each HR's own Groq / Gemini keys and which AI their work uses.
export const aiSettingsController = {
  get: defineApiHandler(event => aiSettingsService.get(requireUser(event).id)),

  saveKey: defineApiHandler(async (event) => {
    const { provider } = parseParams(event, ProviderParams)
    return aiSettingsService.saveKey(requireUser(event).id, provider, await parseBody(event, SaveKeyBody))
  }),

  removeKey: defineApiHandler((event) => {
    const { provider } = parseParams(event, ProviderParams)
    return aiSettingsService.removeKey(requireUser(event).id, provider)
  }),

  setActive: defineApiHandler(async (event) => {
    const { provider } = await parseBody(event, SetActiveBody)
    return aiSettingsService.setActive(requireUser(event).id, provider)
  }),

  listModels: defineApiHandler(async (event) => {
    const { provider } = parseParams(event, ProviderParams)
    const { apiKey } = await parseBody(event, ListModelsBody)
    return aiSettingsService.listModels(requireUser(event).id, provider, apiKey)
  }),

  test: defineApiHandler(event => aiSettingsService.test(requireUser(event).id))
}
