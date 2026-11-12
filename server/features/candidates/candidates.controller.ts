import { sendRedirect, setResponseHeader } from 'h3'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody, parseParams, parseQuery } from '~~/server/core/http/validate'
import { CandidateIdParams, ListCandidatesQuery, ListSelectedQuery, UpdateStatusBody } from './candidates.dto'
import { candidatesService } from './candidates.service'

export const candidatesController = {
  list: defineApiHandler(event => candidatesService.list(parseQuery(event, ListCandidatesQuery))),

  listSelected: defineApiHandler(event => candidatesService.listSelected(parseQuery(event, ListSelectedQuery))),

  selectedFilters: defineApiHandler(() => candidatesService.selectedFilters()),

  /** GET /api/candidates/:id/resume: sends the browser on to a resume link that works for a few minutes. */
  openResume: defineApiHandler(async (event) => {
    const { id } = parseParams(event, CandidateIdParams)
    const link = await candidatesService.resumeLink(id)
    setResponseHeader(event, 'cache-control', 'no-store')
    return sendRedirect(event, link, 302)
  }),

  updateStatus: defineApiHandler(async (event) => {
    const { id } = parseParams(event, CandidateIdParams)
    await candidatesService.updateStatus(id, await parseBody(event, UpdateStatusBody))
    return { message: 'Status updated successfully' }
  })
}
