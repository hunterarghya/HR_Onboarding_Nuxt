import { fetchPDFsFromGroup, getWhatsAppStatus } from '~~/server/integrations/whatsapp/whatsapp.client'
import type { RawAttachment } from '../ingestion.types'

export const isWhatsAppReady = () => getWhatsAppStatus().status === 'ready'
export const whatsAppStatus = () => getWhatsAppStatus().status

/** PDFs posted in a WhatsApp group after `since` (all recent ones if null). */
export const collectFromGroup = async (groupId: string, since: Date | null): Promise<RawAttachment[]> =>
  fetchPDFsFromGroup(groupId, since)
