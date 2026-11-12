import { NotFoundError, ValidationError } from '~~/server/core/errors/app-error'
import { usersRepository } from './users.repository'

const toProfile = (u: { id: number, email: string, name: string | null, company_name: string | null }) =>
  ({ id: u.id, email: u.email, name: u.name, company_name: u.company_name })

export const COMPANY_NAME_REQUIRED = 'Set your company name (user menu) before sending emails'

export const profileService = {
  /** The signed-in HR as the app shows them. Read from the database, since the session holds only id/email/name. */
  async get(userId: number) {
    const user = await usersRepository.findById(userId)
    if (!user) throw new NotFoundError('User')
    return toProfile(user)
  },

  async setCompanyName(userId: number, companyName: string) {
    const user = await usersRepository.updateCompanyName(userId, companyName)
    if (!user) throw new NotFoundError('User')
    return toProfile(user)
  },

  /** For outgoing mail: emails say "at {{company_name}}", so it must be set first. */
  async requireCompanyName(userId: number) {
    const { company_name } = await profileService.get(userId)
    if (!company_name) throw new ValidationError(null, COMPANY_NAME_REQUIRED)
    return company_name
  },

  /** For previews: the HR's company, or a stand-in until they set one. */
  async companyNameForPreview(userId: number) {
    return (await usersRepository.findById(userId))?.company_name || 'Your Company'
  }
}
