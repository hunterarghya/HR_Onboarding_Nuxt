import { z } from 'zod'
import { CANDIDATE_STATUSES, type CandidateStatus } from '~~/server/database/types'

// Query strings: empty values mean "no filter"; anything malformed is a 400.

const limit = z.coerce.number().int().min(1).max(100).default(10)
const cursor = z.string().max(500).optional()
const text = z.string().trim().max(255).optional()
const score = z.union([z.literal(''), z.coerce.number().int().min(0).max(100)]).optional()
const optionalDate = z.union([z.literal(''), z.iso.date()]).optional()

export const SCORE_SORTS = ['newest', 'highToLow', 'lowToHigh'] as const

export const CandidateIdParams = z.object({ id: z.coerce.number().int().positive() })

export const ListCandidatesQuery = z.object({
  limit,
  cursor,
  role: text,
  status: z.union([z.literal(''), z.enum(CANDIDATE_STATUSES)]).optional(),
  source: text,
  name: text,
  minScore: score,
  maxScore: score,
  scoreSort: z.enum(SCORE_SORTS).default('newest')
})

export const ListSelectedQuery = z.object({
  limit,
  cursor,
  offered_role: text,
  offered_location: text,
  dateFrom: optionalDate,
  dateTo: optionalDate,
  offer_sent: z.enum(['', 'true', 'false']).optional()
})

/** Where the previous page of candidates ended (score null = unscored, which sorts lowest). */
export const CandidatesCursor = z.object({ score: z.number().int().nullable(), at: z.iso.datetime(), id: z.number().int().positive() }).strict()
/** Where the previous page of selected candidates ended (date null = no joining date yet, which sorts last). */
export const SelectedCursor = z.object({ date: z.iso.date().nullable(), id: z.number().int().positive() }).strict()

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
export type CandidatesPosition = z.infer<typeof CandidatesCursor>
export type SelectedPosition = z.infer<typeof SelectedCursor>
export type UpdateStatusInput = z.infer<typeof UpdateStatusBody>
