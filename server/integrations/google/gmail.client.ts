import { google, type gmail_v1 } from 'googleapis'
import type { GoogleAuthClient } from './oauth'

const gmailFor = (auth: GoogleAuthClient) => google.gmail({ version: 'v1', auth })

export type GmailMessage = gmail_v1.Schema$Message
export type GmailMessagePart = gmail_v1.Schema$MessagePart

/** Inbox messages with attachments, optionally only those after `sinceDate` (max 50, full payloads). */
export const listMessagesSince = async (auth: GoogleAuthClient, sinceDate: Date | null = null): Promise<GmailMessage[]> => {
  const gmail = gmailFor(auth)

  const queryParts = ['has:attachment']
  if (sinceDate) {
    const epochSeconds = Math.floor(sinceDate.getTime() / 1000)
    queryParts.push(`after:${epochSeconds}`)
  }
  const q = queryParts.join(' ')

  console.log(`--- [Gmail] Fetching emails with query: "${q}" ---`)

  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 50,
    q: q
  })

  const messages = response.data.messages || []
  console.log(`--- [Gmail] Found ${messages.length} matching emails ---`)
  const fullMessages = []

  for (const message of messages) {
    const fullMsg = await gmail.users.messages.get({
      userId: 'me',
      id: message.id!
    })
    fullMessages.push(fullMsg.data)
  }

  return fullMessages
}

/** PDF attachments (raw base64) from a message's parts, walking nested multipart parts. */
export const getPdfAttachments = async (auth: GoogleAuthClient, messageId: string, parts: GmailMessagePart[]): Promise<Array<{ filename: string, data: string }>> => {
  const gmail = gmailFor(auth)
  const attachments: Array<{ filename: string, data: string }> = []

  for (const part of parts) {
    if (part.filename && part.filename.toLowerCase().endsWith('.pdf')) {
      console.log(`--- Gmail: Collecting raw PDF: ${part.filename} ---`)
      const attachId = part.body!.attachmentId!
      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: attachId
      })

      attachments.push({
        filename: part.filename,
        data: response.data.data! // Raw base64 from Gmail API
      })
    } else if (part.parts) {
      const nested = await getPdfAttachments(auth, messageId, part.parts)
      attachments.push(...nested)
    }
  }

  return attachments
}

/** Sends an already-built message (see mime.ts) as the signed-in user. */
export const sendRawMessage = async (auth: GoogleAuthClient, raw: string): Promise<void> => {
  await gmailFor(auth).users.messages.send({ userId: 'me', requestBody: { raw } })
}
