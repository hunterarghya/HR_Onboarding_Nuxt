/**
 * Shared Candidate Processing Pipeline
 * Processes raw PDF attachments from any source (Gmail, WhatsApp, Google Forms)
 * through the same pipeline: PDF text → resume parser → resume scorer → shortlist policy → ImageKit → DB
 */

import { uploadResume } from '~~/server/integrations/imagekit/imagekit.client'
import { candidatesRepository } from '../../candidates/candidates.repository'
import { jobRolesRepository } from '../../job-roles/job-roles.repository'
import type { TaskProgress } from '~~/server/core/tasks/task-status'
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
/**
 * The sender's email, when the source gives one: Gmail's "Name <a@b.com>" → "a@b.com".
 * WhatsApp sender ids ("9198…@c.us") and anything else that isn't an email give null.
 */
export const emailFromSender = (sender: string | undefined): string | null => {
  const match = sender?.match(/[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/i)?.[0]
  if (!match || /@(?:c|g)\.us$|@s\.whatsapp\.net$|@lid$/i.test(match)) return null
  return match.toLowerCase()
}

export const processAttachments = async (
  attachments: RawAttachment[],
  onProgress: (progress: TaskProgress) => Promise<void> = async () => {}
): Promise<number> => {
  const jobRoles = await jobRolesRepository.findAll()

  console.log(`--- [Processor] Processing ${attachments.length} attachment(s) ---`)
  let candidatesFound = 0

  for (const [index, attachment] of attachments.entries()) {
    await onProgress({ done: index, total: attachments.length, stage: 'processing resumes' })
    try {
      console.log(`--- [Process] Handling: ${attachment.filename} (${attachment.source}) ---`)

      const resumeText = await extractPdfText(attachment.data)
      if (!resumeText || resumeText.length < 50) continue

      const parsed = parseResume(resumeText)
      console.log(`--- [Parser] Extracted: ${parsed.name}, ${parsed.email}, ${parsed.phone} ---`)

      const { target_role, job_role_id, score } = await matchResumeToJobs(resumeText, parsed.sections, jobRoles)
      console.log(`--- [Vector] Match: ${target_role} (score: ${score}) ---`)

      // by id: the index may still hold a job's old name for a moment after a rename
      const targetRole = jobRoles.find(r => r.id === job_role_id) ?? OPEN_TARGET
      const { accept, status: finalStatus, minScoreRequired } = decide(targetRole, score)

      if (accept) {
        const email = parsed.email ?? emailFromSender(attachment.sender)
        const name = parsed.name.substring(0, 250)

        const ikUrl = await uploadResume(attachment.data, attachment.filename)
        const inserted = await candidatesRepository.saveFromResume({
          name,
          email,
          phone: parsed.phone?.substring(0, 45) ?? null,
          job_role_id: targetRole.id,
          role_applied: targetRole.role,
          resume_content: resumeText.substring(0, 2000),
          score,
          experience_years: parsed.experience_years,
          status: finalStatus,
          resume_url: ikUrl,
          applied_through: attachment.source,
          current_location: parsed.current_location?.substring(0, 250) ?? null,
          current_ctc: parsed.current_ctc
        })
        console.log(`--- [Database] ${inserted ? 'Saved New' : 'Updated'}: ${name} under ${targetRole.role} ---`)
        candidatesFound++
      } else {
        console.log(`--- [Skip] ${parsed.name} scored ${score} < ${minScoreRequired} for ${targetRole.role} (Auto mode) ---`)
      }
    } catch (procErr) {
      console.error(`--- [Process] Error processing ${attachment.filename}:`, procErr)
    }
  }

  await onProgress({ done: attachments.length, total: attachments.length, stage: 'processing resumes' })
  return candidatesFound
}
