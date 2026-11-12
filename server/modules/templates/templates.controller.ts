import { setResponseStatus } from 'h3'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody, parseParams } from '~~/server/core/http/validate'
import {
  PREVIEW_RAW_MESSAGE, PreviewRawTemplateBody, PreviewTemplateBody,
  SAVE_TEMPLATE_MESSAGE, SaveTemplateBody, TemplateIdParams
} from './templates.dto'
import { templatesService } from './templates.service'

export const templatesController = {
  list: defineApiHandler(() => templatesService.list()),

  get: defineApiHandler((event) => {
    const { id } = parseParams(event, TemplateIdParams)
    return templatesService.get(id)
  }),

  create: defineApiHandler(async (event) => {
    const body = await parseBody(event, SaveTemplateBody, SAVE_TEMPLATE_MESSAGE)
    const template = await templatesService.create(body)
    setResponseStatus(event, 201)
    return template
  }),

  update: defineApiHandler(async (event) => {
    const { id } = parseParams(event, TemplateIdParams)
    return templatesService.update(id, await parseBody(event, SaveTemplateBody, SAVE_TEMPLATE_MESSAGE))
  }),

  remove: defineApiHandler(async (event) => {
    const { id } = parseParams(event, TemplateIdParams)
    await templatesService.remove(id)
    return { message: 'Template deleted' }
  }),

  preview: defineApiHandler(async (event) => {
    const { id } = parseParams(event, TemplateIdParams)
    const { sampleData } = await parseBody(event, PreviewTemplateBody)
    return templatesService.preview(id, sampleData)
  }),

  previewRaw: defineApiHandler(async event =>
    templatesService.previewRaw(await parseBody(event, PreviewRawTemplateBody, PREVIEW_RAW_MESSAGE))
  )
}
