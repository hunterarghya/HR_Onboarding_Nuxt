import { requireUser } from '~~/server/core/auth/current-user'

let isScanning = false

export default defineEventHandler(async (event) => {
  if (isScanning) {
    throw createError({ statusCode: 409, statusMessage: 'WhatsApp scan already in progress' })
  }

  const userData = requireUser(event)

  const body = await readBody(event)
  const { whatsappGroupIds, whatsappGroupId } = body
  const groupIds = whatsappGroupIds || (whatsappGroupId ? [whatsappGroupId] : [])
  isScanning = true

  const pool = usePool()

  console.log(`--- [WhatsApp Scanner] Starting scan for ${userData.email} ---`)
  const allAttachments: RawAttachment[] = []

  try {
    if (groupIds.length > 0) {
      console.log(`--- [WhatsApp] Scanning ${groupIds.length} group(s) ---`)
      const waStatus = getWhatsAppStatus()
      if (waStatus.status === 'ready') {
        for (const gid of groupIds) {
          try {
            const waLastScan = await getLastScanTimestamp(pool, 'whatsapp', gid)
            console.log(`--- [WhatsApp] Group ${gid} last scan: ${waLastScan ? waLastScan.toISOString() : 'NEVER'} ---`)

            const waAttachments = await fetchPDFsFromGroup(gid, waLastScan)
            allAttachments.push(...waAttachments)

            await updateLastScanTimestamp(pool, 'whatsapp', gid)
          } catch (waErr) {
            console.error(`--- [WhatsApp] Error (group ${gid}) ---`, waErr)
          }
        }
      } else {
        console.log(`--- [WhatsApp] Skipping: Status is ${waStatus.status} ---`)
      }
    }

    const candidatesFound = await processAttachments(pool, allAttachments)
    return { message: 'WhatsApp scan complete', count: candidatesFound }
  } catch (err: any) {
    console.error('--- [WhatsApp Scanner] Fatal Error ---', err)
    throw createError({ statusCode: 500, statusMessage: 'WhatsApp scan failed', data: { error: err.message } })
  } finally {
    isScanning = false
  }
})
