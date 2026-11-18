import { beforeEach, describe, expect, it, vi } from 'vitest'

// The embedding model loads once, even when several texts are embedded at the same moment.

const run = vi.fn(async () => ({ data: [0.1, 0.2] }))
const createPipeline = vi.fn()
vi.mock('@xenova/transformers', () => ({ pipeline: createPipeline, env: {} }))
vi.mock('~~/server/config/env', () => ({ config: { embeddings: { cacheDir: null } } }))

describe('embed', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('shares one model load between calls made while it loads', async () => {
    createPipeline.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 10))
      return run
    })
    const { embed } = await import('../../server/integrations/embeddings/embedder')
    await Promise.all([embed('a'), embed('b'), embed('c')])
    await embed('d')
    expect(createPipeline).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(4)
  })

  it('tries the load again after a failed one', async () => {
    createPipeline.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(run)
    const { embed } = await import('../../server/integrations/embeddings/embedder')
    await expect(embed('a')).rejects.toThrow('offline')
    await expect(embed('a')).resolves.toEqual([0.1, 0.2])
    expect(createPipeline).toHaveBeenCalledTimes(2)
  })
})
