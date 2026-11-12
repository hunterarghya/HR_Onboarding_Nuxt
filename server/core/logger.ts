import { consola, type ConsolaInstance } from 'consola'

// Single logging entry point, so the backend (consola today) can change without touching callers.
// Log ids, not personal data: `log.info('candidate saved', { candidateId })`.
export const logger = consola.withTag('hr')

export type Logger = ConsolaInstance
