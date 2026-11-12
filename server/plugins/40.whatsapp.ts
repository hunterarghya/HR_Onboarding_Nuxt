import { initWhatsApp } from '~~/server/integrations/whatsapp/whatsapp.client'

export default defineNitroPlugin(() => {
  console.log('[Plugin] Initializing WhatsApp...')
  initWhatsApp()
})
