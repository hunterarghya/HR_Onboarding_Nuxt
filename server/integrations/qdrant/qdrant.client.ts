import { QdrantClient } from '@qdrant/js-client-rest'
import { config } from '~~/server/config/env'

let client: QdrantClient | null = null

/** The one Qdrant client for the process. */
export const getQdrant = (): QdrantClient => {
  client ??= new QdrantClient({ url: config.qdrant.url })
  return client
}

/** Throws if Qdrant can't be reached. */
export const pingQdrant = async (): Promise<void> => {
  await getQdrant().getCollections()
}
