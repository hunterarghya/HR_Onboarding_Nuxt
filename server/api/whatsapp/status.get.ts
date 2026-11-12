import { getWhatsAppStatus } from '~~/server/integrations/whatsapp/whatsapp.client'

export default defineEventHandler(() => {
  return getWhatsAppStatus()
})
