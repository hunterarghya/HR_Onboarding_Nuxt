// Builds the raw email the Gmail send API takes. Header values can come from templates and candidate
// data, so they're made safe here (SEC-07): line breaks can't add headers, and non-ASCII text is encoded.

/** A header value on one line: any CR/LF (which would start a new header) becomes a space. */
const oneLine = (value: string) => value.replace(/[\r\n]+/g, ' ').trim()

/**
 * A header value as RFC 2047 encoded words when it isn't plain ASCII ("Offer – ₹15 LPA" survives the trip),
 * each word kept under the 75-character limit and folded onto its own line.
 */
export const encodeHeaderValue = (value: string): string => {
  const text = oneLine(value)
  if (/^[\x20-\x7e]*$/.test(text)) return text

  const words: string[] = []
  let chunk = ''
  for (const char of text) { // by code point, so a character is never split across words
    if (Buffer.byteLength(chunk + char, 'utf8') > 45) {
      words.push(chunk)
      chunk = ''
    }
    chunk += char
  }
  if (chunk) words.push(chunk)
  return words.map(w => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ')
}

/** An address for From/To: one line, and nothing that could close the header or add another address. */
const address = (value: string) => {
  const email = oneLine(value)
  if (!/^[^\s<>,;"]+@[^\s<>,;"]+$/.test(email)) throw new Error(`Not a valid email address: ${email}`)
  return email
}

/** Builds a base64url RFC 822 HTML email for the Gmail send API. The body is base64, so line length never matters. */
export const buildRawEmail = (to: string, from: string, subject: string, htmlBody: string): string => {
  const body = Buffer.from(htmlBody, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n')
  const message = [
    `From: ${address(from)}`,
    `To: ${address(to)}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    body
  ].join('\r\n')
  return Buffer.from(message).toString('base64url')
}
