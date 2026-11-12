import { z } from 'zod'

/** Shown for candidates that match no job, and for interview events that aren't for a particular job. */
export const OPEN_POOL = 'Open'
export const OPEN_ROLE = 'Open Role'
const RESERVED_ROLE_NAMES = [OPEN_POOL.toLowerCase(), OPEN_ROLE.toLowerCase()]

// Strict: unknown fields are rejected, every field has a type and a range (VAL-01/02).
// Number inputs send '' when emptied, so '' means "not set" for optional numbers and text.

const emptyToNull = <T>(v: T | '' | null | undefined) => (v === '' || v === undefined ? null : v)

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null)
const optionalNumber = (schema: z.ZodNumber) => z.union([schema, z.literal('')]).nullish().transform(emptyToNull)

export const CRITERIA = ['skills', 'projects', 'experience'] as const

const fields = {
  role: z.string().trim().min(1).max(255)
    .refine(r => !RESERVED_ROLE_NAMES.includes(r.toLowerCase()), 'This name is reserved for candidates and events without a job'),
  /** Annual amounts, in the company's currency */
  salary_min: optionalNumber(z.number().nonnegative().max(1e12)),
  salary_max: optionalNumber(z.number().nonnegative().max(1e12)),
  experience_min_years: optionalNumber(z.number().min(0).max(60)),
  qualification: optionalText(2000),
  skills: optionalText(2000),
  location: optionalText(255),
  shortlist_mode: z.enum(['manual', 'auto']),
  // datetime-local inputs send "2030-01-31T17:00"; '' means no deadline (was a 500: VAL-01)
  deadline: z.union([z.iso.datetime({ offset: true }), z.iso.datetime({ local: true }), z.iso.date(), z.literal('')])
    .nullish().transform(v => v || null),
  min_score: z.number().int().min(0).max(100),
  // weight per resume section used for scoring; leaving a section out means it isn't weighted
  criteria_weights: z.partialRecord(z.enum(CRITERIA), z.number().int().min(0).max(100))
}

const salaryInOrder = (v: { salary_min?: number | null, salary_max?: number | null }) =>
  v.salary_min == null || v.salary_max == null || v.salary_min <= v.salary_max
const SALARY_ORDER = { message: 'salary_min must not be greater than salary_max', path: ['salary_max'] }

export const JobIdParams = z.object({ id: z.coerce.number().int().positive() })

export const CreateJobRoleBody = z.object({
  ...fields,
  shortlist_mode: fields.shortlist_mode.default('manual'),
  min_score: fields.min_score.default(60),
  criteria_weights: fields.criteria_weights.default({})
}).strict().refine(salaryInOrder, SALARY_ORDER)

export const UpdateJobRoleBody = z.object(fields).partial().strict()
  .refine(v => Object.keys(v).length > 0, { message: 'No valid fields provided for update' })
  .refine(salaryInOrder, SALARY_ORDER)

export type CreateJobRoleInput = z.infer<typeof CreateJobRoleBody>
export type UpdateJobRoleInput = z.infer<typeof UpdateJobRoleBody>
