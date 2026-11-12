// Row shapes as node-postgres returns them (TIMESTAMP columns arrive as Date, DATE as "YYYY-MM-DD", NUMERIC as number, BIGINT counts as strings).
// Mirrors the tables created by server/database/migrations.

export interface JobRoleRow {
  id: number
  role: string
  /** annual amounts */
  salary_min: number | null
  salary_max: number | null
  qualification: string | null
  skills: string | null
  experience_min_years: number | null
  location: string | null
  shortlist_mode: 'manual' | 'auto'
  deadline: Date | null
  min_score: number
  criteria_weights: Record<string, number>
  created_at: Date
}

export interface JobRoleWithFormRow extends JobRoleRow {
  form_url: string | null
  google_form_id: string | null
  google_form_db_id?: number | null
}

export const CANDIDATE_STATUSES = ['applied', 'shortlisted', 'hold', 'rejected', 'marked', 'selected'] as const
export type CandidateStatus = typeof CANDIDATE_STATUSES[number]

export interface CandidateRow {
  id: number
  /** The job applied for; null = the "Open" pool (role_applied is then "Open") */
  job_role_id: number | null
  name: string | null
  email: string | null
  phone: string | null
  role_applied: string | null
  date_applied: Date
  resume_content: string | null
  score: number | null
  experience_years: number | null
  status: CandidateStatus
  /** ImageKit path of the resume (or, for old uploads, its public URL); never sent as a link */
  resume_file: string | null
  /** GET route that opens the resume (computed by the database), or null */
  resume_url: string | null
  applied_through: string | null
  current_location: string | null
  current_ctc: number | null
  offered_role: string | null
  offered_salary: number | null
  offered_location: string | null
  joining_date: string | null
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
  /** The job interviewed for; null = an "Open Role" event */
  job_role_id: number | null
  role: string
  event_date: string
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
