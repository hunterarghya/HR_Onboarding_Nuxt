import jwt from 'jsonwebtoken'

let isScanning = false

export default defineEventHandler(async (event) => {
  if (isScanning) {
    throw createError({ statusCode: 409, statusMessage: 'Scan already in progress' })
  }

  const authHeader = getHeader(event, 'authorization')
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  let userData: any
  try {
    userData = jwt.verify(token, process.env.JWT_SECRET || 'secret')
  } catch (err) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid token' })
  }

  const body = await readBody(event)
  const { whatsappGroupIds, whatsappGroupId } = body
  const groupIds = whatsappGroupIds || (whatsappGroupId ? [whatsappGroupId] : [])
  const tokens = userData.tokens
  isScanning = true

  const pool = usePool()

  console.log(`--- [Pipeline] Starting Global Scan for ${userData.email} ---`)
  const allAttachments: RawAttachment[] = []

  try {
    // --- 1. Gmail Phase (timestamp-filtered) ---
    try {
      console.log('--- [Phase 1] Gmail Scanning ---')
      let gmailLastScan = await getLastScanTimestamp(pool, 'gmail')
      if (!gmailLastScan) {
        gmailLastScan = new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
      console.log(`--- [Gmail] Scanning emails after: ${gmailLastScan.toISOString()} ---`)

      const emails = await fetchEmails(tokens, gmailLastScan)
      for (const email of emails) {
        const payload = (email as any).payload
        if (!payload || !payload.parts) continue

        const subject = payload.headers.find((h: any) => h.name === 'Subject')?.value || ''
        const bodyText = (email as any).snippet || ''
        const senderEmail = payload.headers.find((h: any) => h.name === 'From')?.value || ''

        const analysis = await analyzeEmail(subject, bodyText)
        if (analysis.isApplication) {
          console.log(`--- [Gmail] ✅ Application Found: "${subject}" ---`)
          const gmailAttachments = await getAttachments(tokens, (email as any).id, payload.parts)
          allAttachments.push(...gmailAttachments.map(a => ({
            ...a, source: 'Gmail', sender: senderEmail
          })))
        }
      }

      await updateLastScanTimestamp(pool, 'gmail')
      console.log('--- [Gmail] Timestamp updated ---')
    } catch (gmailErr) {
      console.error('--- [Phase 1] Gmail Error ---', gmailErr)
    }

    // --- 2. WhatsApp Phase (multi-group, timestamp-filtered) ---
    if (groupIds.length > 0) {
      console.log(`--- [Phase 2] WhatsApp Scanning (${groupIds.length} group(s)) ---`)
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
            console.error(`--- [Phase 2] WhatsApp Error (group ${gid}) ---`, waErr)
          }
        }
      } else {
        console.log(`--- [WhatsApp] Skipping: Status is ${waStatus.status} ---`)
      }
    }

    // --- 3. Unified Processing Phase ---
    const candidatesFound = await processAttachments(pool, allAttachments)

    return { message: 'Scan complete', count: candidatesFound }
  } catch (err: any) {
    console.error('--- [Pipeline] Fatal Error ---', err)
    throw createError({ statusCode: 500, statusMessage: 'Scan failed', data: { error: err.message } })
  } finally {
    isScanning = false
  }
})

