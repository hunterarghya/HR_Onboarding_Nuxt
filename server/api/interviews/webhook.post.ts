export default defineEventHandler(async (event) => {
  // Google sends a verification request — respond 200 immediately
  setResponseStatus(event, 200)
  console.log('--- [Calendar Webhook] Push notification received ---')
  return 'OK'
})
