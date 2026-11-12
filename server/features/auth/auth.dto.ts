import { z } from 'zod'

// A missing code fails validation, which the callback turns into the usual auth_failed redirect.
export const GoogleCallbackQuery = z.object({ code: z.string().min(1) })

export const UpdateProfileBody = z.object({ company_name: z.string().trim().min(1).max(255) })
export const COMPANY_NAME_MESSAGE = 'company_name is required (1–255 characters)'
