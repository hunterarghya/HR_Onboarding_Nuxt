// Local text embeddings (BAAI/bge-small-en-v1.5, 384 dimensions). The model downloads on first use
// and is cached; loading is lazy so boot never waits on it.

let pipeline: any = null

const getEmbeddingPipeline = async () => {
  if (pipeline) return pipeline
  console.log('--- [Vector] Loading embedding model: BAAI/bge-small-en-v1.5 ---')
  const { pipeline: createPipeline } = await import('@xenova/transformers')
  pipeline = await createPipeline('feature-extraction', 'Xenova/bge-small-en-v1.5')
  console.log('--- [Vector] Embedding model loaded ---')
  return pipeline
}

/** Normalised mean-pooled embedding of the first 8000 characters of `text`. */
export const embed = async (text: string): Promise<number[]> => {
  const pipe = await getEmbeddingPipeline()
  const truncated = text.substring(0, 8000)
  const output = await pipe(truncated, { pooling: 'mean', normalize: true })
  return Array.from(output.data)
}
