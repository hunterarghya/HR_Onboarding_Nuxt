import { NotFoundError } from '~~/server/core/errors/app-error'
import { resumeLink } from '~~/server/integrations/imagekit/imagekit.client'
import { decodeCursor, encodeCursor } from '~~/server/core/http/cursor'
import { CandidatesCursor, SelectedCursor, type CandidatesPosition, type ListCandidatesFilters, type ListSelectedFilters, type SelectedPosition, type UpdateStatusInput } from './candidates.dto'
import { candidatesRepository } from './candidates.repository'

/** Splits the limit + 1 rows a repository returned into a page and whether more exist. */
const toPage = <T>(rows: T[], limit: number, cursorOf: (last: T) => unknown) => {
  const hasNextPage = rows.length > limit
  const data = hasNextPage ? rows.slice(0, limit) : rows
  const nextCursor = hasNextPage ? encodeCursor(cursorOf(data[data.length - 1]!)) : null
  return { data, nextCursor, hasNextPage }
}

export const candidatesService = {
  async list(filters: ListCandidatesFilters) {
    const after = filters.cursor ? decodeCursor(filters.cursor, CandidatesCursor) : null
    const rows = await candidatesRepository.findPage(filters, after)
    return toPage(rows, filters.limit, (last): CandidatesPosition => ({ score: last.score, at: last.date_applied.toISOString(), id: last.id }))
  },

  async listSelected(filters: ListSelectedFilters) {
    const after = filters.cursor ? decodeCursor(filters.cursor, SelectedCursor) : null
    const rows = await candidatesRepository.findSelectedPage(filters, after)
    return toPage(rows, filters.limit, (last): SelectedPosition => ({ date: last.joining_date, id: last.id }))
  },

  async selectedFilters() {
    const roles = await candidatesRepository.distinctOfferedRoles()
    const locations = await candidatesRepository.distinctOfferedLocations()
    return { roles, locations }
  },

  /** A short-lived link to the candidate's resume; 404 if there's none. */
  async resumeLink(id: number) {
    const file = await candidatesRepository.findResumeFile(id)
    if (!file) throw new NotFoundError('Resume')
    return resumeLink(file)
  },

  /** "selected" also records the offer, and needs every offer field. */
  async updateStatus(id: number, input: UpdateStatusInput) {
    const updated = input.status === 'selected'
      ? await candidatesRepository.updateStatusWithOffer(id, input.status, input)
      : await candidatesRepository.updateStatus(id, input.status)
    if (!updated) throw new NotFoundError('Candidate')
  }
}
