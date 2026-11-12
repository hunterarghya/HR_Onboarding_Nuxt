import { describe, expect, it } from 'vitest'
import { parseResume } from '~~/server/features/ingestion/pipeline/resume-parser'

describe('parseResume numbers', () => {
  it.each([
    ['Current CTC: 8 LPA', 800000],
    ['Current CTC: 8.5 lakhs', 850000],
    ['Package: 1.2 cr', 12000000], // used to come out as 1.2 LPA
    ['No salary mentioned here', null]
  ])('reads "%s" as an annual amount', (text, expected) => {
    expect(parseResume(text).current_ctc).toBe(expected)
  })

  it.each([
    ['5 years of experience in backend work', 5],
    ['Experience: 3+ yrs', 3],
    ['Fresh graduate', null]
  ])('reads "%s" as years of experience', (text, expected) => {
    expect(parseResume(text).experience_years).toBe(expected)
  })
})
