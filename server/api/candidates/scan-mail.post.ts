import jwt from 'jsonwebtoken'

let isScanningMail = false

export default defineEventHandler(async (event) => {
  if (isScanningMail) {
    throw createError({ statusCode: 409, statusMessage: 'Email scan already in progress' })
  }

  const authHeader = getHeader(event, 'authorization')
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  let userData: any
  try {
    userData = jwt.verify(token, process.env.JWT_SECRET || 'secret')
  } catch {
    throw createError({ statusCode: 403, statusMessage: 'Invalid token' })
  }

  const tokens = userData.tokens
  isScanningMail = true
  const pool = usePool()

  console.log(`--- [Mail Scanner] Starting Gmail scan for ${userData.email} ---`)
  const allAttachments: RawAttachment[] = []

  try {
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

    const candidatesFound = await processAttachments(pool, allAttachments)
    return { message: 'Email scan complete', count: candidatesFound }
  } catch (err: any) {
    console.error('--- [Mail Scanner] Error ---', err)
    throw createError({ statusCode: 500, statusMessage: 'Email scan failed', data: { error: err.message } })
  } finally {
    isScanningMail = false
  }
})
