import { ValidationError } from '~~/server/core/errors/app-error'
import { OFFER_FIELDS_MESSAGE, type ListCandidatesFilters, type ListSelectedFilters, type UpdateStatusInput } from './candidates.dto'
import { candidatesRepository } from './candidates.repository'

/** Splits the limit + 1 rows a repository returned into a page and whether more exist. */
const toPage = <T>(rows: T[], limit: number, cursorOf: (last: T) => string) => {
  const hasNextPage = rows.length > limit
  const data = hasNextPage ? rows.slice(0, limit) : rows
  const nextCursor = hasNextPage ? cursorOf(data[data.length - 1]!) : null
  return { data, nextCursor, hasNextPage }
}

export const candidatesService = {
  async list(filters: ListCandidatesFilters) {
    const rows = await candidatesRepository.findPage(filters)
    return toPage(rows, filters.limit, last => `${last.score}|${last.date_applied.toISOString()}|${last.id}`)
  },

  async listSelected(filters: ListSelectedFilters) {
    const rows = await candidatesRepository.findSelectedPage(filters)
    return toPage(rows, filters.limit, last =>
      `${last.joining_date ? new Date(last.joining_date).toISOString().split('T')[0] : ''}|${last.id}`)
  },

  async selectedFilters() {
    const roles = await candidatesRepository.distinctOfferedRoles()
    const locations = await candidatesRepository.distinctOfferedLocations()
    return { roles, locations }
  },

  /** "selected" also records the offer, and needs every offer field. Unknown ids are a no-op (unchanged). */
  async updateStatus(id: number, input: UpdateStatusInput) {
    const { status, offered_role, offered_salary, offered_location, joining_date } = input
    if (status === 'selected') {
      if (!offered_role || !offered_salary || !offered_location || !joining_date) {
        throw new ValidationError(null, OFFER_FIELDS_MESSAGE)
      }
      await candidatesRepository.updateStatusWithOffer(id, status, { offered_role, offered_salary, offered_location, joining_date })
    } else {
      await candidatesRepository.updateStatus(id, status)
    }
  }
}
