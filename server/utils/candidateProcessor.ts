/**
 * Shared Candidate Processing Pipeline
 * Processes raw PDF attachments from any source (Gmail, WhatsApp, Google Forms)
 * through the same pipeline: pdf-parse → resumeParser → vectorMatch → imagekit → DB
 */

import pdf from 'pdf-parse'

export interface RawAttachment {
  filename: string
  data: string        // base64 PDF data
  source: string      // 'Gmail' | 'WhatsApp' | 'GoogleForms'
  sender?: string     // email or identifier of who submitted
}

/**
 * Gets the last scan timestamp for a given source type and optional source ID.
 */
export const getLastScanTimestamp = async (pool: any, sourceType: string, sourceId = 'default') => {
  const result = await pool.query(
    'SELECT last_scanned_at FROM scan_timestamps WHERE source_type = $1 AND source_id = $2',
    [sourceType, sourceId]
  )
  if (result.rows.length > 0) {
    return new Date(result.rows[0].last_scanned_at)
  }
  return null
}

/**
 * Updates the last scan timestamp for a given source type and optional source ID.
 */
export const updateLastScanTimestamp = async (pool: any, sourceType: string, sourceId = 'default', timestamp = new Date()) => {
  await pool.query(
    `INSERT INTO scan_timestamps (source_type, source_id, last_scanned_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (source_type, source_id)
     DO UPDATE SET last_scanned_at = $3`,
    [sourceType, sourceId, timestamp]
  )
}

/**
 * Processes an array of raw PDF attachments through the full candidate pipeline:
 * 1. Parse PDF text
 * 2. Extract candidate info (deterministic regex)
 * 3. Vector-match against job descriptions
 * 4. Upload resume to ImageKit
 * 5. Upsert candidate in PostgreSQL
 *
 * @returns Number of candidates successfully processed
 */
export const processAttachments = async (
  pool: any,
  attachments: RawAttachment[]
): Promise<number> => {
  const jobRolesResult = await pool.query('SELECT * FROM job_roles')
  const jobRoles = jobRolesResult.rows

  console.log(`--- [Processor] Processing ${attachments.length} attachment(s) ---`)
  let candidatesFound = 0

  for (const attachment of attachments) {
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

      let targetRole = jobRoles.find((r: any) => r.role === target_role)

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

  return candidatesFound
}
