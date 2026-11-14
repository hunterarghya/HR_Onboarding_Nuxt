import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

// The layer rules in eslint.config.mjs really fire (a rule that silently matches nothing protects nothing).
const eslint = new ESLint()
const lint = async (filePath: string, code: string) => {
  const [result] = await eslint.lintText(code, { filePath })
  return result!.messages.map(m => m.ruleId)
}

describe('import boundaries', () => {
  // loading the Nuxt lint config the first time is slow
  beforeAll(() => lint('server/x.ts', 'export {}\n'), 120_000)

  it('refuses a feature import in an integration', async () => {
    expect(await lint('server/integrations/google/x.ts', `import { jobRolesService } from '~~/server/features/job-roles/job-roles.service'\nexport const x = jobRolesService\n`))
      .toContain('no-restricted-imports')
  })

  it('refuses h3 in a service, which also runs in task workers', async () => {
    expect(await lint('server/features/mail/x.service.ts', `import { getHeader } from 'h3'\nexport const x = getHeader\n`))
      .toContain('no-restricted-imports')
  })

  it('refuses process.env outside config/env.ts', async () => {
    expect(await lint('server/features/mail/y.service.ts', `export const x = process.env.SECRET\n`)).toContain('no-restricted-properties')
  })

  it('allows h3 in a controller and features in plugins', async () => {
    expect(await lint('server/features/mail/x.controller.ts', `import { getHeader } from 'h3'\nexport const x = getHeader\n`)).not.toContain('no-restricted-imports')
    expect(await lint('server/plugins/99.x.ts', `import { jobRolesService } from '~~/server/features/job-roles/job-roles.service'\nexport const x = jobRolesService\n`)).not.toContain('no-restricted-imports')
  })
})
