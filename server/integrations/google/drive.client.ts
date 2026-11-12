import { google } from 'googleapis'
import type { GoogleAuthClient } from './oauth'

/** Extracts a Google Drive file ID from a Drive share or view URL. */
export const extractDriveFileId = (url: string): string | null => {
  if (!url || typeof url !== 'string') return null
  const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return driveMatch?.[1] ?? null
}

/** Downloads a Drive file the user can read and returns its content as base64. */
export const downloadDriveFile = async (auth: GoogleAuthClient, fileId: string): Promise<string> => {
  const drive = google.drive({ version: 'v3', auth })

  console.log(`--- [GoogleForms] Downloading file ${fileId} from Drive ---`)

  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )

  const buffer = Buffer.from(response.data as ArrayBuffer)
  const base64 = buffer.toString('base64')

  console.log(`--- [GoogleForms] File downloaded (${buffer.length} bytes) ---`)
  return base64
}
