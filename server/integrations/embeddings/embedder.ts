import { config } from '~~/server/config/env'

// Local text embeddings (BAAI/bge-small-en-v1.5, 384 dimensions). The model downloads on first use
// and is cached (EMBEDDINGS_CACHE_DIR, if set); loading is lazy so boot never waits on it.

type EmbedPipeline = (text: string, opts: { pooling: 'mean', normalize: boolean }) => Promise<{ data: ArrayLike<number> }>

let pipeline: EmbedPipeline | null = null

const getEmbeddingPipeline = async () => {
  if (pipeline) return pipeline
  console.log('--- [Vector] Loading embedding model: BAAI/bge-small-en-v1.5 ---')
  const { pipeline: createPipeline, env } = await import('@xenova/transformers')
  if (config.embeddings.cacheDir) env.cacheDir = config.embeddings.cacheDir
  pipeline = await createPipeline('feature-extraction', 'Xenova/bge-small-en-v1.5') as unknown as EmbedPipeline
  console.log('--- [Vector] Embedding model loaded ---')
  return pipeline!
}

/** Normalised mean-pooled embedding of the first 8000 characters of `text`. */
export const embed = async (text: string): Promise<number[]> => {
  const pipe = await getEmbeddingPipeline()
  const truncated = text.substring(0, 8000)
  const output = await pipe(truncated, { pooling: 'mean', normalize: true })
  return Array.from(output.data)
}
