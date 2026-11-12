import { ForbiddenError, NotFoundError } from '~~/server/core/errors/app-error'
import type { PreviewRawTemplateInput, SaveTemplateInput } from './templates.dto'
import { renderString } from './template-renderer'
import { getDefaultSampleData } from './template-sample-data'
import { templatesRepository, type TemplateFields } from './templates.repository'

const toFields = (input: SaveTemplateInput): TemplateFields => ({ ...input })

const getOrThrow = async (id: number) => {
  const template = await templatesRepository.findById(id)
  if (!template) throw new NotFoundError('Template')
  return template
}

/** The built-in templates are kept as shipped; HRs copy them into their own to change them. */
const getEditableOrThrow = async (id: number) => {
  const template = await getOrThrow(id)
  if (template.is_default) throw new ForbiddenError('Default templates cannot be changed or deleted')
  return template
}

export const templatesService = {
  list: () => templatesRepository.findAll(),

  get: getOrThrow,

  create: (input: SaveTemplateInput) => templatesRepository.insert(toFields(input)),

  async update(id: number, input: SaveTemplateInput) {
    await getEditableOrThrow(id)
    const template = await templatesRepository.update(id, toFields(input))
    if (!template) throw new NotFoundError('Template')
    return template
  },

  async remove(id: number) {
    await getEditableOrThrow(id)
    if (!(await templatesRepository.delete(id))) throw new NotFoundError('Template')
  },

  /** Renders a saved template with the caller's data, or sample data for its type. */
  async preview(id: number, companyName: string, sampleData?: Record<string, unknown> | null) {
    const template = await getOrThrow(id)
    const data = sampleData || getDefaultSampleData(template.type, companyName)
    return {
      subject: renderString(template.subject, data),
      body: renderString(template.body, data),
      sampleData: data
    }
  },

  /** Renders an unsaved template (its syntax was checked by the DTO). */
  previewRaw(input: PreviewRawTemplateInput, companyName: string) {
    const data = input.sampleData || getDefaultSampleData(input.type, companyName)
    return {
      subject: renderString(input.subject, data),
      body: renderString(input.body, data),
      sampleData: data
    }
  }
}
