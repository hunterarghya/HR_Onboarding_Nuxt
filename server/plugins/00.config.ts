import { config } from '~~/server/config/env'

export default defineNitroPlugin(() => {
  console.log(`[Plugin] Configuration loaded (${config.env})`)
})
