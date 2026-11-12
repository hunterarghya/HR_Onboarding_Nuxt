import { z } from 'zod'

// A missing code fails validation, which the callback turns into the usual auth_failed redirect.
export const GoogleCallbackQuery = z.object({ code: z.string().min(1) })
