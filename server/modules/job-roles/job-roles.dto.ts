import { z } from 'zod'

// Phase 3: accepts what the API accepts today (free-text salary, experience …). Only inputs that used
// to crash become 400s. Numeric salary/experience and strict enums come in the validation phase (VAL-01/02).

const text = z.union([z.string(), z.number()]).nullish()

export const JobIdParams = z.object({ id: z.coerce.number().int().positive() })

export const CreateJobRoleBody = z.object({
  role: z.union([z.string().min(1), z.number()]),
  salary: text,
  qualification: text,
  skills: text,
  experience: text,
  location: text,
  shortlist_mode: z.string().nullish(),
  deadline: z.string().nullish(),
  min_score: z.union([z.number(), z.string()]).nullish(),
  criteria_weights: z.record(z.string(), z.unknown()).nullish()
})

/** Any JSON object; only the allowed columns are applied. */
export const UpdateJobRoleBody = z.record(z.string(), z.unknown())
export const NO_FIELDS_MESSAGE = 'No valid fields provided for update'

export type CreateJobRoleInput = z.infer<typeof CreateJobRoleBody>
export type UpdateJobRoleInput = z.infer<typeof UpdateJobRoleBody>
