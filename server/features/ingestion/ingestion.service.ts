import { AppError, ConflictError } from '~~/server/core/errors/app-error'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'
import { googleFormsRepository } from '../google-forms/google-forms.repository'
import type { RawAttachment, ScanSource } from './ingestion.types'
import { processAttachments } from './pipeline/candidate-pipeline'
import { scanStateRepository } from './scan-state.repository'
import { collectFromGmail } from './sources/gmail.source'
import { collectFromForm } from './sources/google-forms.source'
import { collectFromGroup, isWhatsAppReady, whatsAppStatus } from './sources/whatsapp.source'

// Scans still run inside the HTTP request, one at a time per source (Phase 5 moves them to BullMQ).
const running: Record<ScanSource, boolean> = { gmail: false, whatsapp: false, google_forms: false }

const assertNotRunning = (source: ScanSource, message: string) => {
  if (running[source]) throw new ConflictError(message)
}

const exclusively = async <T>(source: ScanSource, work: () => Promise<T>) => {
  running[source] = true
  try {
    return await work()
  } finally {
    running[source] = false
  }
}

const scanFailed = (label: string, message: string, err: unknown) => {
  console.error(label, err)
  return new AppError(500, 'SCAN_FAILED', message, (err as Error).message)
}

export const ingestionService = {
  assertWhatsappIdle: () => assertNotRunning('whatsapp', 'WhatsApp scan already in progress'),
  assertGmailIdle: () => assertNotRunning('gmail', 'Email scan already in progress'),
  assertFormsIdle: () => assertNotRunning('google_forms', 'Google Forms scan already in progress'),

  /** Resumes posted in the given WhatsApp groups since each group's last scan. */
  scanWhatsapp: (userEmail: string, groupIds: string[]) => exclusively('whatsapp', async () => {
    console.log(`--- [WhatsApp Scanner] Starting scan for ${userEmail} ---`)
    const allAttachments: RawAttachment[] = []

    try {
      if (groupIds.length > 0) {
        console.log(`--- [WhatsApp] Scanning ${groupIds.length} group(s) ---`)
        if (isWhatsAppReady()) {
          for (const gid of groupIds) {
            try {
              const waLastScan = await scanStateRepository.getWatermark('whatsapp', gid)
              console.log(`--- [WhatsApp] Group ${gid} last scan: ${waLastScan ? waLastScan.toISOString() : 'NEVER'} ---`)

              allAttachments.push(...await collectFromGroup(gid, waLastScan))

              await scanStateRepository.setWatermark('whatsapp', gid)
            } catch (waErr) {
              console.error(`--- [WhatsApp] Error (group ${gid}) ---`, waErr)
            }
          }
        } else {
          console.log(`--- [WhatsApp] Skipping: Status is ${whatsAppStatus()} ---`)
        }
      }

      const candidatesFound = await processAttachments(allAttachments)
      return { message: 'WhatsApp scan complete', count: candidatesFound }
    } catch (err) {
      throw scanFailed('--- [WhatsApp Scanner] Fatal Error ---', 'WhatsApp scan failed', err)
    }
  }),

  /**
   * Job applications in Gmail since the last scan (first scan: last 24 h).
   * The watermark moves before processing (BUG-06, fixed with background tasks).
   */
  scanGmail: (auth: GoogleAuthClient, userEmail: string) => exclusively('gmail', async () => {
    console.log(`--- [Mail Scanner] Starting Gmail scan for ${userEmail} ---`)

    try {
      let gmailLastScan = await scanStateRepository.getWatermark('gmail')
      if (!gmailLastScan) {
        gmailLastScan = new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
      console.log(`--- [Gmail] Scanning emails after: ${gmailLastScan.toISOString()} ---`)

      const allAttachments = await collectFromGmail(auth, gmailLastScan)

      await scanStateRepository.setWatermark('gmail')
      console.log('--- [Gmail] Timestamp updated ---')

      const candidatesFound = await processAttachments(allAttachments)
      return { message: 'Email scan complete', count: candidatesFound }
    } catch (err) {
      throw scanFailed('--- [Mail Scanner] Error ---', 'Email scan failed', err)
    }
  }),

  /** Responses to the selected registered forms (all forms if none selected) since each form's last scan. */
  scanForms: (auth: GoogleAuthClient, userEmail: string, selectedFormIds: string[]) => exclusively('google_forms', async () => {
    console.log(`--- [Forms Scanner] Starting Google Forms scan for ${userEmail} ---`)

    try {
      const forms = await googleFormsRepository.findForScan(selectedFormIds)
      if (forms.length === 0) {
        return {
          message: selectedFormIds.length > 0 ? 'No matching Google Forms found to scan' : 'No Google Forms configured',
          count: 0
        }
      }

      console.log(`--- [Forms Scanner] Processing ${forms.length} form(s) (Selected filter: ${selectedFormIds.length > 0 ? selectedFormIds.join(', ') : 'ALL'}) ---`)
      const allAttachments: RawAttachment[] = []

      for (const form of forms) {
        try {
          // Get last scan timestamp for this specific form
          const lastScan = await scanStateRepository.getWatermark('google_forms', form.form_id)
          console.log(`--- [Forms Scanner] Form ${form.form_id} (${form.form_title}) last scan: ${lastScan ? lastScan.toISOString() : 'NEVER'} ---`)

          allAttachments.push(...await collectFromForm(auth, form, lastScan))

          // Update last scan timestamp for this form
          await scanStateRepository.setWatermark('google_forms', form.form_id)
        } catch (formErr) {
          console.error(`--- [Forms Scanner] Error scanning form ${form.form_id}: ${(formErr as Error).message} ---`)
        }
      }

      // Process all collected attachments through the shared pipeline
      const candidatesFound = await processAttachments(allAttachments)
      return { message: 'Google Forms scan complete', count: candidatesFound }
    } catch (err) {
      throw scanFailed('--- [Forms Scanner] Fatal Error ---', 'Google Forms scan failed', err)
    }
  }),

  /**
   * Last scan time per source. WhatsApp: the most recent group. Gmail and Forms: rows are read newest
   * first and each overwrites the last, so Forms shows the oldest form's scan (BUG-23, unchanged).
   */
  async getScanStatus() {
    const rows = await scanStateRepository.findAll()

    const status: Record<ScanSource, { lastScannedAt: Date | null }> = {
      gmail: { lastScannedAt: null },
      whatsapp: { lastScannedAt: null },
      google_forms: { lastScannedAt: null }
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
