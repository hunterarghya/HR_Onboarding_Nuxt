import { z } from 'zod'

// Phase 3: same inputs as today; missing bodies and malformed ids (which used to crash) now return 400.

const loose = z.union([z.string(), z.number()]).nullish()

export const EventIdParams = z.object({ id: z.coerce.number().int().positive() })
export const EligibleParams = z.object({ eventId: z.coerce.number().int().positive() })

export const CreateEventBody = z.object({
  role: loose,
  event_date: loose,
  start_time: loose,
  end_time: loose,
  num_candidates: loose,
  extra_candidates: loose,
  interview_mode: z.string().nullish(),
  venue_or_link: z.string().nullish(),
  // anything but literal false syncs to Google Calendar (unchanged)
  sync_calendar: z.unknown().optional()
})
export const CREATE_EVENT_MESSAGE = 'role, event_date, start_time, end_time are required'

export const AssignCandidatesBody = z.object({ candidate_ids: z.array(z.union([z.number(), z.string()])) })
export const ASSIGN_MESSAGE = 'candidate_ids array is required'

export const AutoAssignAllBody = z.object({ role: z.string().min(1) })
export const AUTO_ASSIGN_ALL_MESSAGE = 'role is required'

export const RegisterWebhookBody = z.object({ webhook_url: z.string().min(1) })
export const REGISTER_WEBHOOK_MESSAGE = 'webhook_url is required'

export type CreateEventInput = z.infer<typeof CreateEventBody>
