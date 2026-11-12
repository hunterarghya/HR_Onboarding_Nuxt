import { z } from 'zod'
import { CANDIDATE_STATUSES, type CandidateStatus } from '~~/server/database/types'

// Phase 3: same inputs as today; malformed numbers that used to crash the query now return 400.

const optionalNumber = z.union([z.literal(''), z.coerce.number().int()]).optional()

export const CandidateIdParams = z.object({ id: z.coerce.number().int().positive() })

export const ListCandidatesQuery = z.object({
  limit: z.coerce.number().int().nonnegative().default(10),
  cursor: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  name: z.string().optional(),
  minScore: optionalNumber,
  maxScore: optionalNumber,
  scoreSort: z.string().optional()
})

export const ListSelectedQuery = z.object({
  limit: z.coerce.number().int().nonnegative().default(10),
  cursor: z.string().optional(),
  offered_role: z.string().optional(),
  offered_location: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  offer_sent: z.string().optional()
})

/**
 * A status change. "selected" also records the offer, so it needs every offer field (VAL-03);
 * the other statuses take nothing else. Unknown statuses and fields are rejected.
 */
export const UpdateStatusBody = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('selected'),
    offered_role: z.string().trim().min(1).max(255),
    /** annual amount */
    offered_salary: z.number().positive().max(1e12),
    offered_location: z.string().trim().min(1).max(255),
    joining_date: z.iso.date()
  }).strict(),
  z.object({ status: z.enum(CANDIDATE_STATUSES.filter(s => s !== 'selected') as [Exclude<CandidateStatus, 'selected'>, ...Exclude<CandidateStatus, 'selected'>[]]) }).strict()
])

export type ListCandidatesFilters = z.infer<typeof ListCandidatesQuery>
export type ListSelectedFilters = z.infer<typeof ListSelectedQuery>
export type UpdateStatusInput = z.infer<typeof UpdateStatusBody>
