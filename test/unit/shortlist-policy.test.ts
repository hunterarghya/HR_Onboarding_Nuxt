import { describe, expect, it } from 'vitest'
import { decide, OPEN_TARGET } from '../../server/features/ingestion/pipeline/shortlist-policy'

describe('shortlist policy', () => {
  it('keeps every resume for manual jobs as applied', () => {
    expect(decide({ role: 'QA', shortlist_mode: 'manual', min_score: 90 }, 10)).toMatchObject({ accept: true, status: 'applied' })
    expect(decide(OPEN_TARGET, 0)).toMatchObject({ accept: true, status: 'applied' })
  })

  it('keeps auto-job resumes at or above min_score as shortlisted', () => {
    expect(decide({ role: 'QA', shortlist_mode: 'auto', min_score: 70 }, 70)).toMatchObject({ accept: true, status: 'shortlisted' })
    expect(decide({ role: 'QA', shortlist_mode: 'auto', min_score: 70 }, 69)).toMatchObject({ accept: false, minScoreRequired: 70 })
  })

  it('keeps a min_score of 0: every resume qualifies (BUG-03 fixed)', () => {
    expect(decide({ role: 'QA', shortlist_mode: 'auto', min_score: 0 }, 5)).toMatchObject({ accept: true, status: 'shortlisted', minScoreRequired: 0 })
  })
})
