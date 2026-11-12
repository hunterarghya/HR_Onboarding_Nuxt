import { downloadDriveFile, extractDriveFileId } from '~~/server/integrations/google/drive.client'
import type { FormResponse } from '~~/server/integrations/google/forms.client'
import type { GoogleAuthClient } from '~~/server/integrations/google/oauth'
import { extractFileAnswer, extractTextAnswer } from './form-answers'

/**
 * Gets the resume PDF behind a form answer, trying in order:
 * 1. a file-upload answer (Drive file id), 2. a Drive share link, 3. any other http(s) URL.
 * Returns null when nothing could be downloaded.
 *
 * Step 3 fetches whatever URL an applicant typed, from inside the server (SEC-04, fixed in Phase 7).
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

      // If not Google Drive or Drive download failed, try direct HTTP fetch if URL
      if (!base64Data && (resumeLink.startsWith('http://') || resumeLink.startsWith('https://'))) {
        try {
          const fetchRes = await fetch(resumeLink)
          if (fetchRes.ok) {
            const arrBuf = await fetchRes.arrayBuffer()
            base64Data = Buffer.from(arrBuf).toString('base64')
            const urlPart = resumeLink.split('/').pop()?.split('?')[0] || 'resume.pdf'
            fileName = urlPart.endsWith('.pdf') ? urlPart : `${urlPart}.pdf`
          }
        } catch (fErr) {
          console.error(`--- [Forms Scanner] Direct URL fetch error: ${(fErr as Error).message} ---`)
        }
      }
    }
  }

  return base64Data ? { data: base64Data, fileName } : null
}
