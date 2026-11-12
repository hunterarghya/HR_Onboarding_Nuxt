import { describe, expect, it } from 'vitest'
import { emailFromSender } from '~~/server/features/ingestion/pipeline/candidate-pipeline'
import { parseResume } from '~~/server/features/ingestion/pipeline/resume-parser'

describe('parseResume missing details', () => {
  it('gives null, not "N/A", for an email, phone or location it can\'t find', () => {
    expect(parseResume('Just some text with no contact details at all')).toMatchObject({ email: null, phone: null, current_location: null })
  })
})

describe('emailFromSender', () => {
  it.each([
    ['Asha Rao <Asha.Rao@Example.org>', 'asha.rao@example.org'],
    ['asha@example.org', 'asha@example.org'],
    ['919876543210@c.us', null], // a WhatsApp sender, not an email
    ['1203630@g.us', null],
    ['', null],
    [undefined, null]
  ])('%s → %s', (sender, expected) => {
    expect(emailFromSender(sender)).toBe(expected)
  })
})

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
