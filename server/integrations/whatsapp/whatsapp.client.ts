import pkg, { type Client as WAClient, type ClientOptions } from 'whatsapp-web.js'
import qrcode from 'qrcode'
import fs from 'fs'
import path from 'path'
import { config } from '~~/server/config/env'
import { fetchMessagesSince } from './fetch-back'

const { Client, LocalAuth } = pkg

/** A PDF found in a group chat (base64 data). */
export interface WhatsAppPdf {
  filename: string
  data: string
  sender: string
  source: 'WhatsApp'
  timestamp: Date
}

let client: WAClient | null = null
let qrCodeData: string | null = null
let status = 'initializing'
let initialized = false
/** Failed starts in a row; reset once WhatsApp gets as far as a QR code or a login */
let startFailures = 0

const AUTH_PATH = './whatsapp-auth'

const cleanupLocks = (dir: string): void => {
  if (!fs.existsSync(dir)) return
  try {
    const files = fs.readdirSync(dir)
    for (const file of files) {
      const fullPath = path.join(dir, file)
      if (fs.lstatSync(fullPath).isDirectory()) {
        cleanupLocks(fullPath)
      } else if (file === 'SingletonLock') {
        try {
          fs.unlinkSync(fullPath)
        } catch {
          // lock file already gone or in use; safe to ignore
        }
      }
    }
  } catch {
    // best-effort cleanup; a missing or unreadable dir is not an error
  }
}

export const initWhatsApp = (): void => {
  if (initialized) return
  initialized = true
  console.log('--- WhatsApp: Initialization Sequence Started ---')
  try {
    cleanupLocks(AUTH_PATH)
  } catch {
    // best-effort cleanup
  }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
    authTimeoutMs: 60000,
    // The current WhatsApp Web, cached next to the session (a volume in Docker). The remote copy this
    // used to load from no longer exists (404), and WhatsApp couldn't start with it.
    webVersionCache: { type: 'local', path: path.join(AUTH_PATH, '.wwebjs_cache') },
    puppeteer: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
      executablePath: config.whatsapp.executablePath,
      headless: true,
      protocolTimeout: 180000
    }
  } as ClientOptions)

  client.on('qr', (qr: string) => {
    if (status !== 'qr') console.log('--- WhatsApp: QR code ready; scan it on the Scanners page ---')
    status = 'qr'
    startFailures = 0
    qrcode.toDataURL(qr, (_err: Error | null | undefined, url: string) => {
      qrCodeData = url
    })
  })

  client.on('ready', () => {
    status = 'ready'
    startFailures = 0
    console.log('--- WhatsApp: Client is READY ---')
  })

  client.on('authenticated', () => {
    if (status !== 'ready') status = 'authenticated'
    console.log('--- WhatsApp: Authenticated! Waiting for Ready... ---')

    setTimeout(async () => {
      if (status === 'authenticated') {
        console.log('--- WhatsApp: Nudging the browser state... ---')
        try {
          const isReady = await client!.getState()
          if (isReady === 'CONNECTED') {
            status = 'ready'
            console.log('--- WhatsApp: Nudge Successful! Force-Ready ---')
          }
        } catch {
          // nudge is best-effort; the 'ready' event may still arrive
        }
      }
    }, 15000)
  })
  client.on('loading_screen', (percent: number, message: string) => {
    console.log(`--- WhatsApp Loading: ${percent}% - ${message} ---`)
  })
  client.on('change_state', (state: string) => {
    console.log('--- WhatsApp State Change:', state)
  })
  client.on('disconnected', () => {
    status = 'initializing'
    initialized = false
    setTimeout(() => initWhatsApp(), 5000)
  })

  client.initialize().catch(async (err: unknown) => {
    console.error('--- WhatsApp Init Error ---', err)
    status = 'error'
    startFailures++
    try {
      await client?.destroy()
    } catch {
      // the browser may already be gone
    }
    // A saved login that can't be used any more (e.g. logged out from the phone) stalls every start.
    // One failure may just be a slow start; after two in a row, drop it so the next start shows a QR code.
    if (startFailures >= 2) clearSavedLogin()
    initialized = false
    const retryInMs = Math.min(startFailures, 6) * 10000
    console.log(`--- WhatsApp: Retrying start in ${retryInMs / 1000}s ---`)
    setTimeout(() => initWhatsApp(), retryInMs)
  })
}

/** Deletes the stored WhatsApp login (LocalAuth's session folder); the next start asks for a new QR scan. */
const clearSavedLogin = (): void => {
  console.log('--- WhatsApp: Clearing the saved login; a new QR code will be needed ---')
  try {
    fs.rmSync(path.join(AUTH_PATH, 'session'), { recursive: true, force: true })
  } catch (err) {
    console.error('--- WhatsApp: Could not clear the saved login ---', err)
  }
}

export const getWhatsAppStatus = () => ({ status, qrCodeData })

export const getGroups = async () => {
  if (status !== 'ready') {
    console.log(`--- WhatsApp: Group fetch skipped (Status: ${status}) ---`)
    return []
  }

  // A failure is thrown, not turned into [] — an empty list reads as "you're in no groups"
  console.log('--- WhatsApp: Fetching groups... ---')
  let chats = await client!.getChats()
  let groups = chats.filter(chat => chat.isGroup)

  if (groups.length === 0) {
    console.log('--- WhatsApp: No groups in memory, waiting 3s to retry... ---')
    await new Promise(r => setTimeout(r, 3000))
    chats = await client!.getChats()
    groups = chats.filter(chat => chat.isGroup)
  }

  console.log(`--- WhatsApp: Found ${groups.length} groups ---`)
  return groups.map(chat => ({ id: chat.id._serialized, name: chat.name }))
}

export const fetchPDFsFromGroup = async (groupId: string, sinceDate: Date | null = null) => {
  if (status !== 'ready') return []
  console.log(`--- WhatsApp: Scanning Group ${groupId} (Doc-Based) ---`)

  try {
    const chat = await client!.getChatById(groupId)
    console.log(`--- WhatsApp: Fetching messages for ${chat.name} ---`)

    // everything since the last scan, not just the last 100 messages
    const messages = await fetchMessagesSince(limit => chat.fetchMessages({ limit }), sinceDate)
    console.log(`--- WhatsApp: Found ${messages.length} messages. Checking media... ---`)

    const attachments: WhatsAppPdf[] = []

    for (const msg of messages) {
      if (sinceDate) {
        const msgDate = new Date(msg.timestamp * 1000)
        if (msgDate <= sinceDate) {
          console.log(`--- WhatsApp: Skipping msg from ${msgDate.toISOString()} (before sinceDate: ${sinceDate.toISOString()}) ---`)
          continue
        }
      }

      if (msg.hasMedia) {
        console.log(`--- WhatsApp: Message has media. Type: ${msg.type}, Timestamp: ${new Date(msg.timestamp * 1000).toISOString()} ---`)
        try {
          const media = await msg.downloadMedia()

          if (media && media.data) {
            console.log(`--- WhatsApp: Media downloaded successfully. Mimetype: ${media.mimetype}, Filename: ${media.filename} ---`)
            if (media.mimetype === 'application/pdf' || (media.filename && media.filename.toLowerCase().endsWith('.pdf'))) {
              console.log(`--- WhatsApp: ✅ PDF Identified: ${media.filename || 'PDF'} ---`)
              attachments.push({
                filename: media.filename || 'resume.pdf',
                data: media.data,
                sender: msg.author || msg.from,
                source: 'WhatsApp',
                timestamp: new Date(msg.timestamp * 1000)
              })
            } else {
              console.log(`--- WhatsApp: Media is not a PDF (skipped) ---`)
            }
          } else {
            console.log(`--- WhatsApp: downloadMedia returned null or no data ---`)
          }
        } catch (downloadErr) {
          console.error(`--- WhatsApp: ❌ downloadMedia Error: ${(downloadErr as Error).message} ---`)
        }
      } else {
        // console.log(`--- WhatsApp: Message has no media ---`)
      }
    }

    console.log(`--- WhatsApp: ${attachments.length} new PDFs from ${chat.name} ---`)
    return attachments
  } catch (err) {
    console.error('--- WhatsApp Global Error ---', err)
    return []
  }
}
