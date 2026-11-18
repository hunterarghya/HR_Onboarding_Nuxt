import { config } from '~~/server/config/env'

// Local text embeddings (BAAI/bge-small-en-v1.5, 384 dimensions). The model downloads on first use
// and is cached (EMBEDDINGS_CACHE_DIR, if set); loading is lazy so boot never waits on it.

type EmbedPipeline = (text: string, opts: { pooling: 'mean', normalize: boolean }) => Promise<{ data: ArrayLike<number> }>

// The load in progress, not just its result: calls made while it loads (a job embeds three texts at
// once) share one load instead of each starting their own
let loading: Promise<EmbedPipeline> | null = null

const loadPipeline = async (): Promise<EmbedPipeline> => {
  console.log('--- [Vector] Loading embedding model: BAAI/bge-small-en-v1.5 ---')
  const { pipeline: createPipeline, env } = await import('@xenova/transformers')
  if (config.embeddings.cacheDir) env.cacheDir = config.embeddings.cacheDir
  const pipeline = await createPipeline('feature-extraction', 'Xenova/bge-small-en-v1.5') as unknown as EmbedPipeline
  console.log('--- [Vector] Embedding model loaded ---')
  return pipeline
}

const getEmbeddingPipeline = (): Promise<EmbedPipeline> => {
  loading ??= loadPipeline().catch((err) => {
    loading = null // a failed load (e.g. no network for the first download) is tried again next time
    throw err
  })
  return loading
}

/** Normalised mean-pooled embedding of the first 8000 characters of `text`. */
export const embed = async (text: string): Promise<number[]> => {
  const pipe = await getEmbeddingPipeline()
  const truncated = text.substring(0, 8000)
  const output = await pipe(truncated, { pooling: 'mean', normalize: true })
  return Array.from(output.data)
}
