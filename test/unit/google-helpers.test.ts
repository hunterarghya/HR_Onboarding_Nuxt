import { describe, expect, it } from 'vitest'
import { extractDriveFileId } from '../../server/integrations/google/drive.client'
import { buildRawEmail } from '../../server/integrations/google/mime'
import { extractFileAnswer, extractTextAnswer } from '../../server/features/ingestion/sources/form-answers'

describe('buildRawEmail', () => {
  it('builds a base64url HTML message with the headers Gmail expects', () => {
    const raw = buildRawEmail('cand@example.com', 'hr@example.com', 'Interview', '<p>Hi</p>')
    expect(raw).toMatch(/^[\w-]+$/)
    expect(Buffer.from(raw, 'base64url').toString('utf8')).toBe(
      'From: hr@example.com\r\nTo: cand@example.com\r\nSubject: Interview\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Hi</p>'
    )
  })
})

describe('extractDriveFileId', () => {
  it.each([
    ['https://drive.google.com/file/d/1AbC_d-9/view?usp=sharing', '1AbC_d-9'],
    ['https://drive.google.com/open?id=XYZ123', 'XYZ123'],
    ['https://example.com/resume.pdf', null],
    ['', null]
  ])('%s → %s', (url, expected) => {
    expect(extractDriveFileId(url)).toBe(expected)
  })
})

describe('form answer extraction', () => {
  const response = {
    answers: {
      q1: { textAnswers: { answers: [{ value: 'https://drive.google.com/file/d/abc/view' }] } },
      q2: { fileUploadAnswers: { answers: [{ fileId: 'file-1', fileName: 'cv.pdf' }] } },
      q3: { textAnswers: { answers: [] } }
    }
  }

  it('reads text answers, with N/A when missing', () => {
    expect(extractTextAnswer(response, 'q1')).toBe('https://drive.google.com/file/d/abc/view')
    expect(extractTextAnswer(response, 'q3')).toBe('N/A')
    expect(extractTextAnswer(response, 'nope')).toBe('N/A')
  })

  it('reads file upload answers, or null', () => {
    expect(extractFileAnswer(response, 'q2')).toEqual({ fileId: 'file-1', fileName: 'cv.pdf' })
    expect(extractFileAnswer(response, 'q1')).toBeNull()
  })
})
