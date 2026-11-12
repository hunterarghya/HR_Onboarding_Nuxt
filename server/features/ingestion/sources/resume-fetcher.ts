import { downloadDriveFile, extractDriveFileId } from '~~/server/integrations/google/drive.client'
import type { FormResponse } from '~~/server/integrations/google/forms.client'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'
import { downloadPdf } from '~~/server/integrations/http/safe-download'
import { extractFileAnswer, extractTextAnswer } from './form-answers'

/**
 * Gets the resume PDF behind a form answer, trying in order:
 * 1. a file-upload answer (Drive file id), 2. a Drive share link, 3. any other public https link to a PDF.
 * Returns null when nothing could be downloaded.
 *
 * Step 3 is a link typed by a member of the public, so it goes through downloadPdf: no internal
 * addresses, size and time limits, PDFs only (SEC-04).
 */
export const fetchResumeFromAnswer = async (auth: GoogleAuthClient, response: FormResponse, resumeQuestionId: string) => {
  let base64Data: string | null = null
  let fileName = 'resume.pdf'

  // 1. Try file upload answer (if user manually configured a file upload question)
  const fileInfo = extractFileAnswer(response, resumeQuestionId)
  if (fileInfo?.fileId) {
    try {
      base64Data = await downloadDriveFile(auth, fileInfo.fileId)
      fileName = fileInfo.fileName || 'resume.pdf'
    } catch (dErr) {
      console.error(`--- [Forms Scanner] Drive file download error: ${(dErr as Error).message} ---`)
    }
  }

  // 2. Try text link answer (Drive share link, public URL)
  if (!base64Data) {
    const resumeLink = extractTextAnswer(response, resumeQuestionId)
    if (resumeLink) {
      const driveFileId = extractDriveFileId(resumeLink)
      if (driveFileId) {
        try {
          base64Data = await downloadDriveFile(auth, driveFileId)
          fileName = `${driveFileId}.pdf`
        } catch (dErr) {
          console.error(`--- [Forms Scanner] Drive link download error: ${(dErr as Error).message} ---`)
        }
      }

      // Not a Drive link (or Drive failed): a public link to the PDF
      if (!base64Data && /^https?:\/\//i.test(resumeLink)) {
        try {
          base64Data = (await downloadPdf(resumeLink)).toString('base64')
          const urlPart = new URL(resumeLink).pathname.split('/').pop() || 'resume.pdf'
          fileName = urlPart.endsWith('.pdf') ? urlPart : `${urlPart}.pdf`
        } catch (fErr) {
          console.error(`--- [Forms Scanner] Resume link refused or failed (${resumeLink}): ${(fErr as Error).message} ---`)
        }
      }
    }
  }

  return base64Data ? { data: base64Data, fileName } : null
}
