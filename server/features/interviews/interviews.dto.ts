import { z } from 'zod'

/** "HH:MM", 24-hour, as a time input sends it */
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time as HH:MM')
/** A slot count; empty means the default */
const count = (min: number, fallback: number) =>
  z.preprocess(v => (v === '' || v === null ? undefined : v), z.number().int().min(min).max(500).default(fallback))

export const INTERVIEW_MODES = ['offline', 'online'] as const
export { OPEN_ROLE } from '../job-roles/job-roles.dto'

export const EventIdParams = z.object({ id: z.coerce.number().int().positive() })
export const EligibleParams = z.object({ eventId: z.coerce.number().int().positive() })

/**
 * An interview slot. Online slots take a meeting link (or none, and Google Meet makes one when the
 * slot is synced); offline slots take a venue. The role must be a current job or "Open Role".
 */
export const CreateEventBody = z.object({
  role: z.string().trim().min(1).max(255),
  event_date: z.iso.date(),
  start_time: time,
  end_time: time,
  num_candidates: count(1, 5),
  extra_candidates: count(0, 0),
  interview_mode: z.enum(INTERVIEW_MODES).default('offline'),
  venue_or_link: z.string().trim().max(2000).optional().transform(v => v || null),
  sync_calendar: z.boolean().default(true)
}).strict()
  .refine(e => e.end_time > e.start_time, { message: 'end_time must be after start_time', path: ['end_time'] })
  .refine(e => e.interview_mode !== 'online' || !e.venue_or_link || z.url({ protocol: /^https?$/ }).safeParse(e.venue_or_link).success,
    { message: 'An online interview needs a web link', path: ['venue_or_link'] })

/** The whole list of candidates for an event (it replaces the current one). */
export const AssignCandidatesBody = z.object({
  candidate_ids: z.array(z.number().int().positive()).max(500)
    .refine(ids => new Set(ids).size === ids.length, 'candidate_ids has duplicates')
}).strict()

export const AutoAssignAllBody = z.object({ role: z.string().trim().min(1).max(255) }).strict()

export type CreateEventInput = z.infer<typeof CreateEventBody>
