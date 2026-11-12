import { requireUser } from '~~/server/core/auth/current-user'

let isScanningForms = false

export default defineEventHandler(async (event) => {
  if (isScanningForms) {
    throw createError({ statusCode: 409, statusMessage: 'Google Forms scan already in progress' })
  }

  const userData = requireUser(event)

  const tokens = userData.tokens
  isScanningForms = true
  const pool = usePool()

  console.log(`--- [Forms Scanner] Starting Google Forms scan for ${userData.email} ---`)

  try {
    const body = await readBody(event).catch(() => ({}))
    const selectedFormIds = Array.isArray(body?.formIds) ? body.formIds.map(String).filter(Boolean) : []

    // Fetch registered forms from DB (all or filtered by selectedFormIds)
    let formsQuery = `
      SELECT gf.*, jr.role as job_role_name
      FROM google_forms gf
      LEFT JOIN job_roles jr ON gf.job_role_id = jr.id
    `
    const queryParams: any[] = []
    if (selectedFormIds.length > 0) {
      formsQuery += ` WHERE gf.form_id = ANY($1) OR gf.id::text = ANY($1)`
      queryParams.push(selectedFormIds)
    }

    const formsResult = await pool.query(formsQuery, queryParams)

    const forms = formsResult.rows
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
        const formId = form.form_id
        const questionMap = form.question_map || {}

        // Get last scan timestamp for this specific form
        const lastScan = await getLastScanTimestamp(pool, 'google_forms', formId)
        console.log(`--- [Forms Scanner] Form ${formId} (${form.form_title}) last scan: ${lastScan ? lastScan.toISOString() : 'NEVER'} ---`)

        // Fetch responses since last scan
        const responses = await fetchFormResponses(tokens, formId, lastScan)

        for (const response of responses) {
          try {
            // Extract resume answer (supports Drive links, direct URLs, or file upload answers)
            const resumeQuestionId = questionMap.resume
            if (!resumeQuestionId) {
              console.log(`--- [Forms Scanner] No resume question mapped for form ${formId}, skipping ---`)
              continue
            }

            let base64Data: string | null = null
            let fileName = 'resume.pdf'

            // 1. Try file upload answer (if user manually configured a file upload question)
            const fileInfo = extractFileAnswer(response, resumeQuestionId)
            if (fileInfo?.fileId) {
              try {
                base64Data = await downloadDriveFile(tokens, fileInfo.fileId)
                fileName = fileInfo.fileName || 'resume.pdf'
              } catch (dErr: any) {
                console.error(`--- [Forms Scanner] Drive file download error: ${dErr.message} ---`)
              }
            }

            // 2. Try text link answer (Drive share link, public URL)
            if (!base64Data) {
              const resumeLink = extractTextAnswer(response, resumeQuestionId)
              if (resumeLink && resumeLink !== 'N/A') {
                const driveFileId = extractDriveFileId(resumeLink)
                if (driveFileId) {
                  try {
                    base64Data = await downloadDriveFile(tokens, driveFileId)
                    fileName = `${driveFileId}.pdf`
                  } catch (dErr: any) {
                    console.error(`--- [Forms Scanner] Drive link download error: ${dErr.message} ---`)
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
                  } catch (fErr: any) {
                    console.error(`--- [Forms Scanner] Direct URL fetch error: ${fErr.message} ---`)
                  }
                }
              }
            }

            // Extract candidate email
            const senderEmail = questionMap.email
              ? extractTextAnswer(response, questionMap.email)
              : 'N/A'

            if (base64Data) {
              allAttachments.push({
                filename: fileName,
                data: base64Data,
                source: 'GoogleForms',
                sender: senderEmail
              })
              console.log(`--- [Forms Scanner] ✅ Resume collected: ${fileName} from ${senderEmail} ---`)
            } else {
              console.warn(`--- [Forms Scanner] ⚠️ Could not retrieve PDF for response ${response.responseId} (${senderEmail}) ---`)
            }
          } catch (respErr: any) {
            console.error(`--- [Forms Scanner] Error processing response ${response.responseId}: ${respErr.message} ---`)
          }
        }

        // Update last scan timestamp for this form
        await updateLastScanTimestamp(pool, 'google_forms', formId)
      } catch (formErr: any) {
        console.error(`--- [Forms Scanner] Error scanning form ${form.form_id}: ${formErr.message} ---`)
      }
    }

    // Process all collected attachments through the shared pipeline
    const candidatesFound = await processAttachments(pool, allAttachments)
    return { message: 'Google Forms scan complete', count: candidatesFound }
  } catch (err: any) {
    console.error('--- [Forms Scanner] Fatal Error ---', err)
    throw createError({ statusCode: 500, statusMessage: 'Google Forms scan failed', data: { error: err.message } })
  } finally {
    isScanningForms = false
  }
})
