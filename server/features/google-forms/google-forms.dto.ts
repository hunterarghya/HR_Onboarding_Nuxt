import { z } from 'zod'

export const CreateFormBody = z.object({ jobRoleId: z.coerce.number().int().positive() })
export const CREATE_FORM_MESSAGE = 'jobRoleId is required'

/** `:id` is a database id or a Google form id; with `?type=job` it is a job id. */
export const FormIdParams = z.object({ id: z.string().min(1) })
export const DeleteFormQuery = z.object({ type: z.string().optional() })
export const JobIdParam = z.object({ id: z.coerce.number().int().positive() })
