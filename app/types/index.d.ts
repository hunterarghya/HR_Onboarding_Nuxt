export interface Job {
  id: number
  role: string
  salary: string
  qualification: string
  skills: string
  experience: string
  location: string
  shortlist_mode: 'manual' | 'auto'
  deadline: string
  min_score: number
  criteria_weights: Record<string, number>
  created_at: string
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
  applied_through: 'Gmail' | 'WhatsApp'
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
