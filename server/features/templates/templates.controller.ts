import { setResponseStatus } from 'h3'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody, parseParams } from '~~/server/core/http/validate'
import {
  PreviewRawTemplateBody, PreviewTemplateBody, SaveTemplateBody, TemplateIdParams
} from './templates.dto'
import { requireUser } from '~~/server/core/auth/current-user'
import { profileService } from '../auth/profile.service'
import { templatesService } from './templates.service'

export const templatesController = {
  list: defineApiHandler(() => templatesService.list()),

  get: defineApiHandler((event) => {
    const { id } = parseParams(event, TemplateIdParams)
    return templatesService.get(id)
  }),

  create: defineApiHandler(async (event) => {
    const body = await parseBody(event, SaveTemplateBody)
    const template = await templatesService.create(body)
    setResponseStatus(event, 201)
    return template
  }),

  update: defineApiHandler(async (event) => {
    const { id } = parseParams(event, TemplateIdParams)
    return templatesService.update(id, await parseBody(event, SaveTemplateBody))
  }),

  remove: defineApiHandler(async (event) => {
    const { id } = parseParams(event, TemplateIdParams)
    await templatesService.remove(id)
    return { message: 'Template deleted' }
  }),

  preview: defineApiHandler(async (event) => {
    const { id } = parseParams(event, TemplateIdParams)
    const { sampleData } = await parseBody(event, PreviewTemplateBody)
    return templatesService.preview(id, await profileService.companyNameForPreview(requireUser(event).id), sampleData)
  }),

  previewRaw: defineApiHandler(async (event) => {
    const body = await parseBody(event, PreviewRawTemplateBody)
    return templatesService.previewRaw(body, await profileService.companyNameForPreview(requireUser(event).id))
  })
}
