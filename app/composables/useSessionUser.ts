export interface SessionUser {
  id: number
  email: string
  name: string | null
}

/**
 * The signed-in user, loaded from /api/auth/me by the auth route guard. The session itself is an
 * httpOnly cookie that page scripts can't read, so this is the frontend's only view of it.
 */
export const useSessionUser = () => useState<SessionUser | null>('session-user', () => null)
