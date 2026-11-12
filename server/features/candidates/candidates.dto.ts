import { z } from 'zod'

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

const offerField = z.union([z.string(), z.number()]).nullish()

export const UpdateStatusBody = z.object({
  status: z.string().nullish(),
  offered_role: offerField,
  offered_salary: offerField,
  offered_location: offerField,
  joining_date: offerField
})
export const OFFER_FIELDS_MESSAGE = 'All offer fields (offered_role, offered_salary, offered_location, joining_date) are required for "selected" status.'

export type ListCandidatesFilters = z.infer<typeof ListCandidatesQuery>
export type ListSelectedFilters = z.infer<typeof ListSelectedQuery>
export type UpdateStatusInput = z.infer<typeof UpdateStatusBody>
