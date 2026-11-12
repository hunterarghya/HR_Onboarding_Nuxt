import { AppError, NotFoundError } from '~~/server/core/errors/app-error'
import type { PreviewRawTemplateInput, SaveTemplateInput } from './templates.dto'
import { renderString } from './template-renderer'
import { getDefaultSampleData } from './template-sample-data'
import { templatesRepository, type TemplateFields } from './templates.repository'

const toFields = (input: SaveTemplateInput): TemplateFields => ({
  name: input.name,
  subject: input.subject || '',
  body: input.body,
  type: input.type || 'custom'
})

const getOrThrow = async (id: number) => {
  const template = await templatesRepository.findById(id)
  if (!template) throw new NotFoundError('Template')
  return template
}

export const templatesService = {
  list: () => templatesRepository.findAll(),

  get: getOrThrow,

  create: (input: SaveTemplateInput) => templatesRepository.insert(toFields(input)),

  async update(id: number, input: SaveTemplateInput) {
    const template = await templatesRepository.update(id, toFields(input))
    if (!template) throw new NotFoundError('Template')
    return template
  },

  async remove(id: number) {
    if (!(await templatesRepository.delete(id))) throw new NotFoundError('Template')
  },

  /** Renders a saved template with the caller's data, or sample data for its type. */
  async preview(id: number, sampleData?: Record<string, unknown> | null) {
    const template = await getOrThrow(id)
    const data = sampleData || getDefaultSampleData(template.type)
    return {
      subject: renderString(template.subject, data),
      body: renderString(template.body, data),
      sampleData: data
    }
  },

  /** Renders an unsaved template. Handlebars syntax errors are reported to the caller. */
  previewRaw(input: PreviewRawTemplateInput) {
    const data = input.sampleData || getDefaultSampleData(input.type || 'custom')
    try {
      return {
        subject: renderString(input.subject || '', data),
        body: renderString(input.body, data),
        sampleData: data
      }
    } catch (err) {
      throw new AppError(500, 'TEMPLATE_COMPILE_ERROR', 'Template compilation error', (err as Error).message)
    }
  }
}
