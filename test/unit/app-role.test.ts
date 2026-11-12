import { describe, expect, it } from 'vitest'
import { roleDuties } from '../../server/core/app-role'

describe('APP_ROLE', () => {
  it.each([
    ['all', { runsWorkers: true, runsWhatsApp: true }],
    ['web', { runsWorkers: false, runsWhatsApp: false }],
    ['worker', { runsWorkers: true, runsWhatsApp: true }]
  ] as const)('%s', (role, duties) => {
    expect(roleDuties(role)).toEqual(duties)
  })
})
