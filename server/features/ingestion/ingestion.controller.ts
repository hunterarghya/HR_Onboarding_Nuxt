import { readBody, setResponseStatus } from 'h3'
import { requireUser } from '~~/server/core/auth/current-user'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody } from '~~/server/core/http/validate'
import { ScanFormsBody, ScanWhatsappBody, selectedFormIds } from './ingestion.dto'
import { ingestionService } from './ingestion.service'

// Scans answer 202 { taskId, status: 'queued' } at once; the UI polls GET /api/tasks/:taskId.

export const ingestionController = {
  scanWhatsapp: defineApiHandler(async (event) => {
    const user = requireUser(event)
    const { whatsappGroupIds, whatsappGroupId } = await parseBody(event, ScanWhatsappBody)
    const groupIds = whatsappGroupIds || (whatsappGroupId ? [whatsappGroupId] : [])
    const task = await ingestionService.enqueueWhatsappScan(user.id, groupIds)
    setResponseStatus(event, 202)
    return task
  }),

  scanGmail: defineApiHandler(async (event) => {
    const task = await ingestionService.enqueueGmailScan(requireUser(event).id)
    setResponseStatus(event, 202)
    return task
  }),

  scanForms: defineApiHandler(async (event) => {
    const user = requireUser(event)
    const raw = await readBody(event).catch(() => ({}))
    const parsed = ScanFormsBody.safeParse(raw)
    const formIds = parsed.success ? selectedFormIds(parsed.data) : []
    const task = await ingestionService.enqueueFormsScan(user.id, formIds)
    setResponseStatus(event, 202)
    return task
  }),

  scanStatus: defineApiHandler(() => ingestionService.getScanStatus())
}
