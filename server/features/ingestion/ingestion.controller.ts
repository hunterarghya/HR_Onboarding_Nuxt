import { readBody } from 'h3'
import { requireUser } from '~~/server/core/auth/current-user'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { parseBody } from '~~/server/core/http/validate'
import { googleAuthService } from '../auth/google-auth.service'
import { ScanFormsBody, ScanWhatsappBody, selectedFormIds } from './ingestion.dto'
import { ingestionService } from './ingestion.service'

export const ingestionController = {
  scanWhatsapp: defineApiHandler(async (event) => {
    ingestionService.assertWhatsappIdle()
    const user = requireUser(event)
    const { whatsappGroupIds, whatsappGroupId } = await parseBody(event, ScanWhatsappBody)
    const groupIds = whatsappGroupIds || (whatsappGroupId ? [whatsappGroupId] : [])
    return ingestionService.scanWhatsapp(user.email, groupIds)
  }),

  scanGmail: defineApiHandler(async (event) => {
    ingestionService.assertGmailIdle()
    const user = requireUser(event)
    return ingestionService.scanGmail(await googleAuthService.getAuthClientForUser(user.id), user.email)
  }),

  scanForms: defineApiHandler(async (event) => {
    ingestionService.assertFormsIdle()
    const user = requireUser(event)
    const raw = await readBody(event).catch(() => ({}))
    const parsed = ScanFormsBody.safeParse(raw)
    const formIds = parsed.success ? selectedFormIds(parsed.data) : []
    return ingestionService.scanForms(await googleAuthService.getAuthClientForUser(user.id), user.email, formIds)
  }),

  scanStatus: defineApiHandler(() => ingestionService.getScanStatus())
}
