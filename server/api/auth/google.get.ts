import { generateAuthUrl } from '~~/server/integrations/google/oauth'

export default defineEventHandler(() => {
  return { url: generateAuthUrl() }
})
