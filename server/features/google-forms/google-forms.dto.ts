import { z } from 'zod'

export const CreateFormBody = z.object({ jobRoleId: z.number().int().positive() }).strict()

/** A form's database id. */
export const FormIdParams = z.object({ id: z.coerce.number().int().positive() })
/** A job's id (DELETE /api/jobs/:id/form). */
export const JobIdParam = z.object({ id: z.coerce.number().int().positive() })
