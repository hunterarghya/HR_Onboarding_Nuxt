import { NotFoundError } from '~~/server/core/errors/app-error'
import { enqueue, isTaskRunning } from '~~/server/core/tasks/queues'
import type { TaskProgress } from '~~/server/core/tasks/task-status'
import { googleAuthService } from '../auth/google-auth.service'
import { usersRepository } from '../auth/users.repository'
import { googleFormsRepository } from '../google-forms/google-forms.repository'
import type { RawAttachment, ScanSource } from './ingestion.types'
import { processAttachments } from './pipeline/candidate-pipeline'
import { scanStateRepository } from './scan-state.repository'
import { collectFromGmail } from './sources/gmail.source'
import { collectFromForm } from './sources/google-forms.source'
import { collectFromGroup, isWhatsAppReady, whatsAppStatus } from './sources/whatsapp.source'

// Scans run as background tasks (scans queue). The HTTP request only enqueues and answers 202;
// a worker calls the run* functions below. One scan per source at a time: the fixed task ids make
// a second request a 409 while one is queued or running, across restarts and processes.
export const SCAN_TASK_IDS: Record<ScanSource, string> = {
  gmail: 'scan.gmail',
  whatsapp: 'scan.whatsapp',
  google_forms: 'scan.forms'
}

type ReportProgress = (progress: TaskProgress) => Promise<void>

/** The task fails with the reason; BullMQ retries it (TASK_RETRY_DELAY_MS apart) before giving up. */
const scanFailed = (label: string, message: string, err: unknown) => {
  console.error(label, err)
  return new Error(`${message}: ${(err as Error).message}`, { cause: err })
}

const userEmail = async (userId: number) => {
  const user = await usersRepository.findById(userId)
  if (!user) throw new NotFoundError('User')
  return user.email
}

export const ingestionService = {
  enqueueWhatsappScan: (userId: number, groupIds: string[]) =>
    enqueue('scan.whatsapp', { userId, groupIds }, { taskId: SCAN_TASK_IDS.whatsapp, conflictMessage: 'WhatsApp scan already in progress' }),

  /** Checks the Google connection up front (401 now rather than a failed task later). */
  async enqueueGmailScan(userId: number) {
    await googleAuthService.getAuthClientForUser(userId)
    return enqueue('scan.gmail', { userId }, { taskId: SCAN_TASK_IDS.gmail, conflictMessage: 'Email scan already in progress' })
  },

  async enqueueFormsScan(userId: number, formIds: string[]) {
    await googleAuthService.getAuthClientForUser(userId)
    return enqueue('scan.forms', { userId, formIds }, { taskId: SCAN_TASK_IDS.google_forms, conflictMessage: 'Google Forms scan already in progress' })
  },

  /** Task scan.whatsapp: resumes posted in the given WhatsApp groups since each group's last scan. */
  async runWhatsappScan(userId: number, groupIds: string[], onProgress?: ReportProgress) {
    const email = await userEmail(userId)
    console.log(`--- [WhatsApp Scanner] Starting scan for ${email} ---`)
    const allAttachments: RawAttachment[] = []
    // Watermarks move to the scan's start, and only after processing succeeded (BUG-06)
    const scanStartedAt = new Date()
    const scannedGroups: string[] = []

    try {
      if (groupIds.length > 0) {
        console.log(`--- [WhatsApp] Scanning ${groupIds.length} group(s) ---`)
        if (isWhatsAppReady()) {
          for (const gid of groupIds) {
            try {
              const waLastScan = await scanStateRepository.getWatermark('whatsapp', gid)
              console.log(`--- [WhatsApp] Group ${gid} last scan: ${waLastScan ? waLastScan.toISOString() : 'NEVER'} ---`)

              allAttachments.push(...await collectFromGroup(gid, waLastScan))
              scannedGroups.push(gid)
            } catch (waErr) {
              console.error(`--- [WhatsApp] Error (group ${gid}) ---`, waErr)
            }
          }
        } else {
          console.log(`--- [WhatsApp] Skipping: Status is ${whatsAppStatus()} ---`)
        }
      }

      const candidatesFound = await processAttachments(allAttachments, onProgress)
      for (const gid of scannedGroups) await scanStateRepository.setWatermark('whatsapp', gid, scanStartedAt)
      return { message: 'WhatsApp scan complete', count: candidatesFound }
    } catch (err) {
      throw scanFailed('--- [WhatsApp Scanner] Fatal Error ---', 'WhatsApp scan failed', err)
    }
  },

  /**
   * Task scan.gmail: job applications in Gmail since the last scan (first scan: last 24 h).
   * The watermark moves to the scan's start time only once every resume was processed, so a crash
   * or failed attempt re-reads the same emails on retry instead of skipping them (BUG-06).
   */
  async runGmailScan(userId: number, onProgress?: ReportProgress) {
    const email = await userEmail(userId)
    console.log(`--- [Mail Scanner] Starting Gmail scan for ${email} ---`)

    try {
      const auth = await googleAuthService.getAuthClientForUser(userId)
      const scanStartedAt = new Date()
      let gmailLastScan = await scanStateRepository.getWatermark('gmail')
      if (!gmailLastScan) {
        gmailLastScan = new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
      console.log(`--- [Gmail] Scanning emails after: ${gmailLastScan.toISOString()} ---`)

      const allAttachments = await collectFromGmail(auth, gmailLastScan)
      const candidatesFound = await processAttachments(allAttachments, onProgress)

      await scanStateRepository.setWatermark('gmail', 'default', scanStartedAt)
      console.log('--- [Gmail] Timestamp updated ---')
      return { message: 'Email scan complete', count: candidatesFound }
    } catch (err) {
      throw scanFailed('--- [Mail Scanner] Error ---', 'Email scan failed', err)
    }
  },

  /** Task scan.forms: responses to the selected forms (all forms if none selected) since each form's last scan. */
  async runFormsScan(userId: number, selectedFormIds: string[], onProgress?: ReportProgress) {
    const email = await userEmail(userId)
    console.log(`--- [Forms Scanner] Starting Google Forms scan for ${email} ---`)

    try {
      const auth = await googleAuthService.getAuthClientForUser(userId)
      const forms = await googleFormsRepository.findForScan(selectedFormIds)
      if (forms.length === 0) {
        return {
          message: selectedFormIds.length > 0 ? 'No matching Google Forms found to scan' : 'No Google Forms configured',
          count: 0
        }
      }

      console.log(`--- [Forms Scanner] Processing ${forms.length} form(s) (Selected filter: ${selectedFormIds.length > 0 ? selectedFormIds.join(', ') : 'ALL'}) ---`)
      const allAttachments: RawAttachment[] = []
      // Watermarks move to the scan's start, and only after processing succeeded (BUG-06)
      const scanStartedAt = new Date()
      const scannedForms: string[] = []

      for (const form of forms) {
        try {
          // Get last scan timestamp for this specific form
          const lastScan = await scanStateRepository.getWatermark('google_forms', form.form_id)
          console.log(`--- [Forms Scanner] Form ${form.form_id} (${form.form_title}) last scan: ${lastScan ? lastScan.toISOString() : 'NEVER'} ---`)

          allAttachments.push(...await collectFromForm(auth, form, lastScan))
          scannedForms.push(form.form_id)
        } catch (formErr) {
          console.error(`--- [Forms Scanner] Error scanning form ${form.form_id}: ${(formErr as Error).message} ---`)
        }
      }

      // Process all collected attachments through the shared pipeline
      const candidatesFound = await processAttachments(allAttachments, onProgress)
      for (const formId of scannedForms) await scanStateRepository.setWatermark('google_forms', formId, scanStartedAt)
      return { message: 'Google Forms scan complete', count: candidatesFound }
    } catch (err) {
      throw scanFailed('--- [Forms Scanner] Fatal Error ---', 'Google Forms scan failed', err)
    }
  },

  /**
   * Last scan time per source, and whether a scan is running. WhatsApp: the most recent group. Gmail and Forms: rows are read newest
   * first and each overwrites the last, so Forms shows the oldest form's scan (BUG-23, unchanged).
   */
  async getScanStatus() {
    const rows = await scanStateRepository.findAll()

    const [gmail, whatsapp, forms] = await Promise.all([
      isTaskRunning(SCAN_TASK_IDS.gmail), isTaskRunning(SCAN_TASK_IDS.whatsapp), isTaskRunning(SCAN_TASK_IDS.google_forms)
    ])
    // running: a scan of that source is queued or in progress, so the page can show (and follow) it
    const status: Record<ScanSource, { lastScannedAt: Date | null, running: boolean }> = {
      gmail: { lastScannedAt: null, running: gmail },
      whatsapp: { lastScannedAt: null, running: whatsapp },
      google_forms: { lastScannedAt: null, running: forms }
    }

    for (const row of rows) {
      if (row.source_type === 'gmail') {
        status.gmail.lastScannedAt = row.last_scanned_at
      } else if (row.source_type === 'whatsapp') {
        // Use the most recent whatsapp scan across all groups
        if (!status.whatsapp.lastScannedAt || new Date(row.last_scanned_at) > new Date(status.whatsapp.lastScannedAt)) {
          status.whatsapp.lastScannedAt = row.last_scanned_at
        }
      } else if (row.source_type === 'google_forms') {
        status.google_forms.lastScannedAt = row.last_scanned_at
      }
    }

    return status
  }
}
