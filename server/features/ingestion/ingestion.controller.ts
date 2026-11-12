import { setResponseStatus } from 'h3'
import { requireUser } from '~~/server/core/auth/current-user'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody } from '~~/server/core/http/validate'
import { ScanFormsBody, ScanWhatsappBody } from './ingestion.dto'
import { ingestionService } from './ingestion.service'

// Scans answer 202 { taskId, status: 'queued' } at once; the UI polls GET /api/tasks/:taskId.

export const ingestionController = {
  scanWhatsapp: defineApiHandler(async (event) => {
    const user = requireUser(event)
    const { whatsappGroupIds } = await parseBody(event, ScanWhatsappBody)
    const task = await ingestionService.enqueueWhatsappScan(user.id, whatsappGroupIds)
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
    const { formIds } = await parseBody(event, ScanFormsBody)
    const task = await ingestionService.enqueueFormsScan(user.id, formIds)
    setResponseStatus(event, 202)
    return task
  }),

  scanStatus: defineApiHandler(() => ingestionService.getScanStatus())
}
