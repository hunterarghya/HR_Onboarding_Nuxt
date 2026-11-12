import { AppError } from '~~/server/core/errors/app-error'
import { defineApiHandler } from '~~/server/core/http/define-api-handler'
import { getGroups, getWhatsAppStatus } from '~~/server/integrations/whatsapp/whatsapp.client'

// The WhatsApp session itself lives in integrations/whatsapp; this is just its HTTP surface.
export const whatsappController = {
  /** { status, qrCodeData }; the QR code is only set while waiting for a phone to link. */
  status: defineApiHandler(() => getWhatsAppStatus()),

  /** Groups the linked account belongs to ([] until the client is ready). */
  groups: defineApiHandler(async () => {
    try {
      return await getGroups()
    } catch (err) {
      console.error('Error fetching groups:', err)
      throw new AppError(500, 'WHATSAPP_FAILED', 'Failed to fetch groups')
    }
  })
}
