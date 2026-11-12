/** A resume PDF collected by a scanner, before it becomes a candidate. */
export interface RawAttachment {
  filename: string
  data: string // base64 PDF data
  source: string // 'Gmail' | 'WhatsApp' | 'GoogleForms'
  sender?: string // email or identifier of who submitted
}

export type ScanSource = 'gmail' | 'whatsapp' | 'google_forms'
