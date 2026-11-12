/** Builds a base64url RFC 822 HTML email for the Gmail send API. */
export const buildRawEmail = (to: string, from: string, subject: string, htmlBody: string): string => {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody
  ].join('\r\n')
  return Buffer.from(message).toString('base64url')
}
