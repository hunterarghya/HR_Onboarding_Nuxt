export interface SessionUser {
  id: number
  email: string
  name: string | null
  /** Entered by the HR; their emails say "at <company_name>". Null until set. */
  company_name: string | null
}

/**
 * The signed-in user, loaded from /api/auth/me by the auth route guard. The session itself is an
 * httpOnly cookie that page scripts can't read, so this is the frontend's only view of it.
 */
export const useSessionUser = () => useState<SessionUser | null>('session-user', () => null)

/** Opens the company name dialog (layouts/default.vue) from anywhere, e.g. the user menu. */
export const useCompanyNameDialog = () => useState('company-name-dialog', () => false)
