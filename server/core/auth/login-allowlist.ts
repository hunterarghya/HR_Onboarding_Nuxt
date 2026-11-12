export interface LoginAllowlist {
  /** e.g. ['odysseus.example']: anyone with an address at these domains */
  domains: string[]
  /** e.g. ['hr.lead@gmail.com']: these exact addresses */
  emails: string[]
}

/** Case-insensitive. Lists are lower-cased when the config is loaded. */
export const isEmailAllowed = (email: string, allowlist: LoginAllowlist): boolean => {
  const normalized = email.trim().toLowerCase()
  const domain = normalized.slice(normalized.lastIndexOf('@') + 1)
  return allowlist.emails.includes(normalized) || allowlist.domains.includes(domain)
}
