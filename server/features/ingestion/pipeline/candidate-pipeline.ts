/**
 * Shared Candidate Processing Pipeline
 * Processes raw PDF attachments from any source (Gmail, WhatsApp, Google Forms)
 * through the same pipeline: PDF text → resume parser → resume scorer → shortlist policy → ImageKit → DB
 */

import { uploadResume } from '~~/server/integrations/imagekit/imagekit.client'
import { candidatesRepository } from '../../candidates/candidates.repository'
import { jobRolesRepository } from '../../job-roles/job-roles.repository'
import type { RawAttachment } from '../ingestion.types'
import { extractPdfText } from './pdf-text'
import { parseResume } from './resume-parser'
import { matchResumeToJobs } from './resume-scorer'
import { decide, OPEN_TARGET } from './shortlist-policy'

/**
 * Turns each attachment into a candidate (insert, or update the same email + role).
 * A failing attachment is logged and skipped; the rest still go through.
 *
 * @returns Number of candidates successfully processed
 */
export const processAttachments = async (attachments: RawAttachment[]): Promise<number> => {
  const jobRoles = await jobRolesRepository.findAll()

  console.log(`--- [Processor] Processing ${attachments.length} attachment(s) ---`)
  let candidatesFound = 0

  for (const attachment of attachments) {
    try {
      console.log(`--- [Process] Handling: ${attachment.filename} (${attachment.source}) ---`)

      const resumeText = await extractPdfText(attachment.data)
      if (!resumeText || resumeText.length < 50) continue

      const parsed = parseResume(resumeText)
      console.log(`--- [Parser] Extracted: ${parsed.name}, ${parsed.email}, ${parsed.phone} ---`)

      const { target_role, score } = await matchResumeToJobs(resumeText, parsed.sections, jobRoles)
      console.log(`--- [Vector] Match: ${target_role} (score: ${score}) ---`)

      const targetRole = jobRoles.find(r => r.role === target_role) ?? OPEN_TARGET
      const { accept, status: finalStatus, minScoreRequired } = decide(targetRole, score)

      if (accept) {
        const finalEmail = (parsed.email && parsed.email !== 'N/A') ? parsed.email : (attachment.sender || 'N/A')

        const safeName = (parsed.name || 'Unknown').substring(0, 250)
        const safePhone = (parsed.phone || 'N/A').substring(0, 45)
        const safeExperience = (parsed.experience_level || 'N/A').substring(0, 95)
        const safeLocation = (parsed.current_location || 'N/A').substring(0, 250)
        const safeCtc = (parsed.current_ctc || 'N/A').substring(0, 95)

        const existingId = await candidatesRepository.findIdByEmailAndRole(finalEmail, targetRole.role)
        const ikUrl = await uploadResume(attachment.data, attachment.filename)

        if (existingId !== null) {
          await candidatesRepository.updateFromResume(existingId, {
            score, resume_url: ikUrl, applied_through: attachment.source, current_location: safeLocation, current_ctc: safeCtc, status: finalStatus
          })
          console.log(`--- [Database] Updated: ${safeName} under ${targetRole.role} ---`)
        } else {
          await candidatesRepository.insertFromResume({
            name: safeName,
            email: finalEmail,
            phone: safePhone,
            role_applied: targetRole.role,
            resume_content: resumeText.substring(0, 2000),
            score,
            experience_level: safeExperience,
            status: finalStatus,
            resume_url: ikUrl,
            applied_through: attachment.source,
            current_location: safeLocation,
            current_ctc: safeCtc
          })
          console.log(`--- [Database] Saved New: ${safeName} under ${targetRole.role} ---`)
        }
        candidatesFound++
      } else {
        console.log(`--- [Skip] ${parsed.name} scored ${score} < ${minScoreRequired} for ${targetRole.role} (Auto mode) ---`)
      }
    } catch (procErr) {
      console.error(`--- [Process] Error processing ${attachment.filename}:`, procErr)
    }
  }

  return candidatesFound
}
