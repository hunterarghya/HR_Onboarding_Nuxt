export default defineEventHandler(async () => {
  const pool = usePool()

  const result = await pool.query(
    `SELECT source_type, source_id, last_scanned_at FROM scan_timestamps ORDER BY last_scanned_at DESC`
  )

  const status: Record<'gmail' | 'whatsapp' | 'google_forms', { lastScannedAt: string | null }> = {
    gmail: { lastScannedAt: null },
    whatsapp: { lastScannedAt: null },
    google_forms: { lastScannedAt: null }
  }

  for (const row of result.rows) {
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
})
