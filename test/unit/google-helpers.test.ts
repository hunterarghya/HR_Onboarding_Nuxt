import { describe, expect, it } from 'vitest'
import { extractDriveFileId } from '../../server/integrations/google/drive.client'
import { buildRawEmail, encodeHeaderValue } from '../../server/integrations/google/mime'
import { extractFileAnswer, extractTextAnswer } from '../../server/features/ingestion/sources/form-answers'

const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8')
/** The decoded Subject header, unfolded, with its encoded words turned back into text */
const subjectOf = (message: string) => message.match(/^Subject: (.*(?:\r\n .*)*)/m)![1]!
  .replace(/\r\n /g, '')
  .replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b64: string) => Buffer.from(b64, 'base64').toString('utf8'))

describe('buildRawEmail', () => {
  it('builds a base64url HTML message with the headers Gmail expects, body in base64', () => {
    const raw = buildRawEmail('cand@example.com', 'hr@example.com', 'Interview', '<p>Hi</p>')
    expect(raw).toMatch(/^[\w-]+$/)
    expect(decode(raw)).toBe(
      'From: hr@example.com\r\nTo: cand@example.com\r\nSubject: Interview\r\nMIME-Version: 1.0\r\n'
      + 'Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'
      + Buffer.from('<p>Hi</p>').toString('base64')
    )
  })

  it('cannot be given extra headers through the subject (SEC-07)', () => {
    const message = decode(buildRawEmail('cand@example.com', 'hr@example.com', 'Hello\r\nBcc: everyone@example.com', 'x'))
    expect(message).not.toMatch(/^Bcc:/m)
    expect(subjectOf(message)).toBe('Hello Bcc: everyone@example.com')
  })

  it('encodes a non-ASCII subject so it arrives intact (SEC-07: ₹ and emoji were garbled)', () => {
    const subject = 'Offer – ₹15,00,000 for the Senior Backend Developer role 🎉 at Odysseus'
    const message = decode(buildRawEmail('cand@example.com', 'hr@example.com', subject, 'x'))
    expect(subjectOf(message)).toBe(subject)
    for (const line of message.split('\r\n')) expect(line.length).toBeLessThanOrEqual(998)
    expect(message).toMatch(/^Subject: =\?UTF-8\?B\?/m)
  })

  it('keeps long and non-ASCII bodies intact', () => {
    const body = `<p>${'₹ '.repeat(2000)}</p>`
    const message = decode(buildRawEmail('cand@example.com', 'hr@example.com', 'x', body))
    const encoded = message.split('\r\n\r\n')[1]!
    expect(Buffer.from(encoded.replace(/\r\n/g, ''), 'base64').toString('utf8')).toBe(body)
    for (const line of encoded.split('\r\n')) expect(line.length).toBeLessThanOrEqual(76)
  })

  it.each(['cand@example.com\r\nBcc: x@example.com', 'a@example.com, b@example.com', 'not an address'])('refuses the recipient %j', (to) => {
    expect(() => buildRawEmail(to, 'hr@example.com', 'x', 'x')).toThrow(/Not a valid email address/)
  })

  it('leaves plain ASCII header values readable', () => {
    expect(encodeHeaderValue('Interview at 10:00')).toBe('Interview at 10:00')
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

  it('reads text answers, with null when missing', () => {
    expect(extractTextAnswer(response, 'q1')).toBe('https://drive.google.com/file/d/abc/view')
    expect(extractTextAnswer(response, 'q3')).toBeNull()
    expect(extractTextAnswer(response, 'nope')).toBeNull()
  })

  it('reads file upload answers, or null', () => {
    expect(extractFileAnswer(response, 'q2')).toEqual({ fileId: 'file-1', fileName: 'cv.pdf' })
    expect(extractFileAnswer(response, 'q1')).toBeNull()
  })
})
