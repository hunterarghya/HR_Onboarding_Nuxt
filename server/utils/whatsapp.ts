import pkg from 'whatsapp-web.js'
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode'
import fs from 'fs'
import path from 'path'

let client: any = null
let qrCodeData: string | null = null
let status = 'initializing'
let initialized = false

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
        try { fs.unlinkSync(fullPath) } catch (err) { }
      }
    }
  } catch (e) { }
}

export const initWhatsApp = (): void => {
  if (initialized) return
  initialized = true
  console.log('--- WhatsApp: Initialization Sequence Started ---')
  try { cleanupLocks(AUTH_PATH) } catch (err) { }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
    authTimeoutMs: 60000,
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wwebjs/web-nodejs/main/index.html'
    },
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
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      headless: true,
      protocolTimeout: 180000
    }
  } as any)

  client.on('qr', (qr: string) => { status = 'qr'; qrcode.toDataURL(qr, (err: any, url: string) => { qrCodeData = url }) })

  client.on('ready', () => {
    status = 'ready'
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
        } catch (e) { }
      }
    }, 15000)
  })
  client.on('loading_screen', (percent: number, message: string) => { console.log(`--- WhatsApp Loading: ${percent}% - ${message} ---`) })
  client.on('change_state', (state: string) => { console.log('--- WhatsApp State Change:', state) })
  client.on('disconnected', () => { status = 'initializing'; initialized = false; setTimeout(() => initWhatsApp(), 5000) })

  client.initialize().catch((err: any) => {
    console.error('--- WhatsApp Init Error ---', err)
    status = 'error'
  })
}

export const getWhatsAppStatus = () => ({ status, qrCodeData })

export const getGroups = async () => {
  if (status !== 'ready') {
    console.log(`--- WhatsApp: Group fetch skipped (Status: ${status}) ---`)
    return []
  }

  try {
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
    return groups.map(chat => ({ id: (chat.id as any)._serialized, name: chat.name }))
  } catch (err) {
    console.error('--- WhatsApp Error Fetching Groups ---', err)
    return []
  }
}

export const fetchPDFsFromGroup = async (groupId: string, sinceDate: Date | null = null) => {
  if (status !== 'ready') return []
  console.log(`--- WhatsApp: Scanning Group ${groupId} (Doc-Based) ---`)

  try {
    const chat = await client!.getChatById(groupId)
    console.log(`--- WhatsApp: Fetching messages for ${chat.name} ---`)

    const messages = await chat.fetchMessages({ limit: 100 })
    console.log(`--- WhatsApp: Found ${messages.length} messages. Checking media... ---`)

    const attachments: any[] = []

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
                sender: (msg as any).author || msg.from,
                source: 'WhatsApp',
                timestamp: new Date(msg.timestamp * 1000)
              })
            } else {
               console.log(`--- WhatsApp: Media is not a PDF (skipped) ---`)
            }
          } else {
             console.log(`--- WhatsApp: downloadMedia returned null or no data ---`)
          }
        } catch (downloadErr: any) {
          console.error(`--- WhatsApp: ❌ downloadMedia Error: ${downloadErr.message} ---`)
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
