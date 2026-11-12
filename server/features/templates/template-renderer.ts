import Handlebars from 'handlebars'

/** Fills a Handlebars template string. Shared by template previews and outgoing mail. */
export const renderString = (template: string, data: Record<string, unknown>): string =>
  Handlebars.compile(template)(data)
