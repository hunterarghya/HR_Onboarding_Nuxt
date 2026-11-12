import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const exchangeCode = vi.fn()
const getUserInfo = vi.fn()
const upsertOnLogin = vi.fn()
const saveCredentials = vi.fn()

vi.mock('~~/server/integrations/google/oauth', () => ({ exchangeCode, getUserInfo, generateAuthUrl: () => 'https://accounts.google.com/x' }))
vi.mock('~~/server/features/auth/users.repository', () => ({ usersRepository: { upsertOnLogin } }))
vi.mock('~~/server/features/auth/google-credentials.repository', () => ({ googleCredentialsRepository: { save: saveCredentials } }))

// The unit env allows the example.com domain (vitest.config.ts)
const { authService } = await import('../../server/features/auth/auth.service')

const googleTokens = { access_token: 'ya29.x', refresh_token: '1//r', expiry_date: 1 }

describe('authService.completeGoogleLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    exchangeCode.mockResolvedValue({ client: {}, tokens: googleTokens })
    upsertOnLogin.mockResolvedValue({ id: 42, email: 'hr@example.com', name: 'HR' })
  })

  it('stores the Google tokens server-side and signs a session without them', async () => {
    getUserInfo.mockResolvedValue({ email: 'hr@example.com', name: 'HR', verified_email: true })
    const token = await authService.completeGoogleLogin('code')

    expect(saveCredentials).toHaveBeenCalledWith(42, googleTokens)
    const payload = jwt.decode(token) as Record<string, unknown>
    expect(payload).toMatchObject({ sub: '42', email: 'hr@example.com' })
    expect(JSON.stringify(payload)).not.toContain('ya29')
  })

  it('refuses accounts outside the allowlist and stores nothing for them', async () => {
    getUserInfo.mockResolvedValue({ email: 'someone@gmail.com', verified_email: true })
    await expect(authService.completeGoogleLogin('code')).rejects.toMatchObject({ statusCode: 403 })
    expect(upsertOnLogin).not.toHaveBeenCalled()
    expect(saveCredentials).not.toHaveBeenCalled()
  })

  it('refuses unverified addresses even on an allowed domain', async () => {
    getUserInfo.mockResolvedValue({ email: 'hr@example.com', verified_email: false })
    await expect(authService.completeGoogleLogin('code')).rejects.toMatchObject({ statusCode: 403 })
  })
})
