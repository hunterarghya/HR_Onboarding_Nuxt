// Row shapes as node-postgres returns them (TIMESTAMP and DATE columns arrive as Date, BIGINT counts as strings).
// Mirrors the schema created in modules/system/schema.ts until versioned migrations replace it.

export interface JobRoleRow {
  id: number
  role: string
  salary: string | null
  qualification: string | null
  skills: string | null
  experience: string | null
  location: string | null
  shortlist_mode: string | null
  deadline: Date | null
  min_score: number | null
  criteria_weights: Record<string, number> | null
  created_at: Date
}

export interface JobRoleWithFormRow extends JobRoleRow {
  form_url: string | null
  google_form_id: string | null
  google_form_db_id?: number | null
}

export interface CandidateRow {
  id: number
  name: string | null
  email: string | null
  phone: string | null
  role_applied: string | null
  date_applied: Date
  resume_content: string | null
  score: number | null
  experience_level: string | null
  status: string | null
  resume_url: string | null
  applied_through: string | null
  current_location: string | null
  current_ctc: string | null
  offered_role: string | null
  offered_salary: string | null
  offered_location: string | null
  joining_date: Date | null
  offer_sent: boolean | null
}

export interface ScanTimestampRow {
  id: number
  source_type: string
  source_id: string
  last_scanned_at: Date
}

export interface InterviewEventRow {
  id: number
  role: string
  event_date: Date
  start_time: string
  end_time: string
  num_candidates: number
  extra_candidates: number
  interview_mode: string | null
  venue_or_link: string | null
  google_event_id: string | null
  created_at: Date
}

export interface EmailTemplateRow {
  id: number
  name: string
  subject: string
  body: string
  type: string
  is_default: boolean
  created_at: Date
  updated_at: Date
}

export interface GoogleFormRow {
  id: number
  form_id: string
  form_url: string
  form_title: string | null
  job_role_id: number | null
  question_map: Record<string, string>
  created_at: Date
}
