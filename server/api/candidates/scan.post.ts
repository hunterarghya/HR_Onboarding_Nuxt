import jwt from 'jsonwebtoken'
import pdf from 'pdf-parse'

let isScanning = false

const getLastScanTimestamp = async (pool: any, sourceType: string, sourceId = 'default') => {
  const result = await pool.query(
    'SELECT last_scanned_at FROM scan_timestamps WHERE source_type = $1 AND source_id = $2',
    [sourceType, sourceId]
  )
  if (result.rows.length > 0) {
    return new Date(result.rows[0].last_scanned_at)
  }
  return null
}

const updateLastScanTimestamp = async (pool: any, sourceType: string, sourceId = 'default', timestamp = new Date()) => {
  await pool.query(
    `INSERT INTO scan_timestamps (source_type, source_id, last_scanned_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (source_type, source_id)
     DO UPDATE SET last_scanned_at = $3`,
    [sourceType, sourceId, timestamp]
  )
}

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
  const allAttachments: any[] = []

  try {
    const jobRolesResult = await pool.query('SELECT * FROM job_roles')
    const jobRoles = jobRolesResult.rows

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

    // --- 3. Unified Processing Phase (Vector Matching) ---
    console.log(`--- [Phase 3] Processing Unified List (${allAttachments.length} total) ---`)
    let candidatesFound = 0

    for (const attachment of allAttachments) {
      try {
        console.log(`--- [Process] Handling: ${attachment.filename} (${attachment.source}) ---`)

        const pdfBuffer = Buffer.from(attachment.data, 'base64')
        const pdfParsed = await pdf(pdfBuffer)
        const resumeText = pdfParsed.text

        if (!resumeText || resumeText.length < 50) continue

        const parsed = parseResume(resumeText)
        console.log(`--- [Parser] Extracted: ${parsed.name}, ${parsed.email}, ${parsed.phone} ---`)

        const { target_role, score } = await matchResumeToJobs(resumeText, parsed.sections, jobRoles)
        console.log(`--- [Vector] Match: ${target_role} (score: ${score}) ---`)

        let targetRole = jobRoles.find(r => r.role === target_role)

        if (!targetRole) {
          targetRole = { role: 'Open', shortlist_mode: 'manual', min_score: 0 }
        }

        const minScoreRequired = targetRole.min_score || 60
        const isAuto = targetRole.shortlist_mode === 'auto'

        if (targetRole.shortlist_mode === 'manual' || (isAuto && score >= minScoreRequired)) {
          const finalEmail = (parsed.email && parsed.email !== 'N/A') ? parsed.email : (attachment.sender || 'N/A')
          const finalStatus = targetRole.shortlist_mode === 'manual' ? 'applied' : 'shortlisted'

          const safeName = (parsed.name || 'Unknown').substring(0, 250)
          const safePhone = (parsed.phone || 'N/A').substring(0, 45)
          const safeExperience = (parsed.experience_level || 'N/A').substring(0, 95)
          const safeLocation = (parsed.current_location || 'N/A').substring(0, 250)
          const safeCtc = (parsed.current_ctc || 'N/A').substring(0, 95)

          const existing = await pool.query('SELECT id FROM candidates WHERE email = $1 AND role_applied = $2', [finalEmail, targetRole.role])

          if (existing.rows.length > 0) {
            const ikUrl = await uploadResume(attachment.data, attachment.filename)
            await pool.query(
              `UPDATE candidates SET score = $1, date_applied = NOW(), resume_url = $2, applied_through = $3, current_location = $4, current_ctc = $5, status = $6 WHERE id = $7`,
              [score, ikUrl, attachment.source, safeLocation, safeCtc, finalStatus, existing.rows[0].id]
            )
            console.log(`--- [Database] Updated: ${safeName} under ${targetRole.role} ---`)
          } else {
            const ikUrl = await uploadResume(attachment.data, attachment.filename)
            await pool.query(
              `INSERT INTO candidates (name, email, phone, role_applied, resume_content, score, experience_level, status, resume_url, applied_through, current_location, current_ctc)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [safeName, finalEmail, safePhone, targetRole.role, resumeText.substring(0, 2000), score, safeExperience, finalStatus, ikUrl, attachment.source, safeLocation, safeCtc]
            )
            console.log(`--- [Database] Saved New: ${safeName} under ${targetRole.role} ---`)
          }
          candidatesFound++
        } else {
          console.log(`--- [Skip] ${parsed.name} scored ${score} < ${minScoreRequired} for ${targetRole.role} (Auto mode) ---`)
        }
      } catch (procErr: any) {
        console.error(`--- [Process] Error processing ${attachment.filename}:`, procErr)
      }
    }

    return { message: 'Scan complete', count: candidatesFound }
  } catch (err: any) {
    console.error('--- [Pipeline] Fatal Error ---', err)
    throw createError({ statusCode: 500, statusMessage: 'Scan failed', data: { error: err.message } })
  } finally {
    isScanning = false
  }
})
