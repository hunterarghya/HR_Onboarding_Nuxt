export interface Job {
  id: number
  role: string
  /** annual amounts */
  salary_min: number | null
  salary_max: number | null
  qualification: string
  skills: string
  experience_min_years: number | null
  location: string
  shortlist_mode: 'manual' | 'auto'
  deadline: string | null
  min_score: number
  criteria_weights: Record<string, number>
  created_at: string
  form_url?: string
  google_form_id?: string
  google_form_db_id?: number
}

export type CandidateStatus = 'applied' | 'shortlisted' | 'hold' | 'rejected' | 'marked' | 'selected'

export interface Candidate {
  id: number
  name: string
  email: string
  phone: string
  role_applied: string
  date_applied: string
  score: number
  experience_level: string
  status: CandidateStatus
  resume_url: string
  applied_through: 'Gmail' | 'WhatsApp' | 'GoogleForms'
  current_location: string
  current_ctc: string
  offered_role?: string
  offered_salary?: string
  offered_location?: string
  joining_date?: string
  offer_sent?: boolean
}

export interface InterviewEvent {
  id: number
  role: string
  event_date: string
  start_time: string
  end_time: string
  num_candidates: number
  extra_candidates: number
  interview_mode: 'online' | 'offline'
  venue_or_link: string
  google_event_id?: string
  created_at: string
}

export interface EmailTemplate {
  id: number
  name: string
  subject: string
  body: string
  type: 'rejection' | 'invite' | 'offer' | 'custom'
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface WAStatus {
  status: string
  qrCodeData: string | null
}

export interface WAGroup {
  id: string
  name: string
}

export interface PaginatedResponse<T> {
  data: T[]
  hasNextPage: boolean
  nextCursor: string | null
}

export interface UnsentCount {
  event_id: number
  event_date: string
  unsent_count: number
}

export interface GoogleForm {
  id: number
  form_id: string
  form_url: string
  form_title: string
  job_role_id: number | null
  job_role_name: string | null
  question_map: Record<string, string>
  created_at: string
}
