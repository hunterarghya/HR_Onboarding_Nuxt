import Handlebars from 'handlebars'

/** Fills a Handlebars HTML template (values are HTML-escaped). Shared by template previews and outgoing mail. */
export const renderString = (template: string, data: Record<string, unknown>): string =>
  Handlebars.compile(template)(data)

/** Fills a plain-text template such as a subject line: no HTML escaping, so "R&D" stays "R&D". */
export const renderText = (template: string, data: Record<string, unknown>): string =>
  Handlebars.compile(template, { noEscape: true })(data)
