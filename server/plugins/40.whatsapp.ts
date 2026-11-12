import { config } from '~~/server/config/env'
import { roleDuties } from '~~/server/core/app-role'
import { initWhatsApp } from '~~/server/integrations/whatsapp/whatsapp.client'

// The WhatsApp browser session lives with the workers (it is what the WhatsApp scan task reads).
// With APP_ROLE=web it isn't started; status/groups then read "initializing" until WhatsApp state
// is shared through Redis (only needed if web and worker are ever split into separate processes).
export default defineNitroPlugin(() => {
  if (!roleDuties(config.app.role).runsWhatsApp) return
  console.log('[Plugin] Initializing WhatsApp...')
  initWhatsApp()
})
