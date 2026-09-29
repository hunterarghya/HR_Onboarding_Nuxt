import jwt from 'jsonwebtoken'

let isScanningForms = false

export default defineEventHandler(async (event) => {
  if (isScanningForms) {
    throw createError({ statusCode: 409, statusMessage: 'Google Forms scan already in progress' })
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

  const tokens = userData.tokens
  isScanningForms = true
  const pool = usePool()

  console.log(`--- [Forms Scanner] Starting Google Forms scan for ${userData.email} ---`)

  try {
    // Fetch all registered forms from DB
    const formsResult = await pool.query(`
      SELECT gf.*, jr.role as job_role_name
      FROM google_forms gf
      LEFT JOIN job_roles jr ON gf.job_role_id = jr.id
    `)

    const forms = formsResult.rows
    if (forms.length === 0) {
      return { message: 'No Google Forms configured', count: 0 }
    }

    console.log(`--- [Forms Scanner] Processing ${forms.length} form(s) ---`)
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
            // Extract file upload answer (resume PDF)
            const resumeQuestionId = questionMap.resume
            if (!resumeQuestionId) {
              console.log(`--- [Forms Scanner] No resume question mapped for form ${formId}, skipping ---`)
              continue
            }

            const fileInfo = extractFileAnswer(response, resumeQuestionId)
            if (!fileInfo) {
              console.log(`--- [Forms Scanner] Response ${response.responseId} has no file upload, skipping ---`)
              continue
            }

            // Download the PDF from Google Drive
            const base64Data = await downloadDriveFile(tokens, fileInfo.fileId)

            // Extract text fields from the response
            const senderEmail = questionMap.email
              ? extractTextAnswer(response, questionMap.email)
              : 'N/A'

            allAttachments.push({
              filename: fileInfo.fileName,
              data: base64Data,
              source: 'GoogleForms',
              sender: senderEmail
            })

            console.log(`--- [Forms Scanner] ✅ Resume collected: ${fileInfo.fileName} from ${senderEmail} ---`)
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
