import { config } from '~~/server/config/env'
import type { JobRoleRow } from '~~/server/database/types'
import { embed } from '~~/server/integrations/embeddings/embedder'
import { getQdrant } from '~~/server/integrations/qdrant/qdrant.client'

// Job descriptions in Qdrant: one point per job (id = job id) with three named vectors.
// Failures are logged and thrown; indexing runs as background tasks, which retry (BUG-11).

const COLLECTION_NAME = config.qdrant.collection
const VECTOR_SIZE = config.qdrant.vectorSize

type JobForVector = Pick<JobRoleRow, 'id' | 'role' | 'skills' | 'qualification' | 'experience_min_years' | 'location' | 'shortlist_mode' | 'min_score' | 'criteria_weights'>

/** "3+ years experience", the wording the embedding model compares resumes against */
const experienceText = (years: number | null) => (years == null ? '' : `${years}+ years experience`)

export const jobVectorsRepository = {
  async ensureCollection(): Promise<void> {
    try {
      const collections = await getQdrant().getCollections()
      const exists = collections.collections.some(c => c.name === COLLECTION_NAME)
      if (!exists) {
        await getQdrant().createCollection(COLLECTION_NAME, {
          vectors: {
            full: { size: VECTOR_SIZE, distance: 'Cosine' },
            skills: { size: VECTOR_SIZE, distance: 'Cosine' },
            experience: { size: VECTOR_SIZE, distance: 'Cosine' }
          }
        })
        console.log(`--- [Vector] Created Qdrant collection: ${COLLECTION_NAME} ---`)
      } else {
        console.log(`--- [Vector] Qdrant collection already exists: ${COLLECTION_NAME} ---`)
      }
    } catch (err) {
      console.error('--- [Vector] Error initializing Qdrant collection:', (err as Error).message)
      throw err
    }
  },

  /** Embeds the job's text (full / skills / experience) and stores it under the job id. */
  async upsert(job: JobForVector): Promise<void> {
    try {
      const fullText = `${job.role}. ${job.skills || ''}. ${job.qualification || ''}. ${experienceText(job.experience_min_years)}. ${job.location || ''}`
      const skillsText = job.skills || job.role
      const expText = experienceText(job.experience_min_years) || 'Any experience'

      const [fullVec, skillsVec, expVec] = await Promise.all([
        embed(fullText),
        embed(skillsText),
        embed(expText)
      ])

      await getQdrant().upsert(COLLECTION_NAME, {
        wait: true,
        points: [{
          id: job.id,
          vector: { full: fullVec, skills: skillsVec, experience: expVec },
          payload: {
            role: job.role,
            skills: job.skills,
            experience_min_years: job.experience_min_years,
            shortlist_mode: job.shortlist_mode,
            min_score: job.min_score,
            criteria_weights: job.criteria_weights || null
          }
        }]
      })
      console.log(`--- [Vector] Upserted JD: ${job.role} (id: ${job.id}) ---`)
    } catch (err) {
      console.error(`--- [Vector] Error upserting JD ${job.role}:`, (err as Error).message)
      throw err
    }
  },

  async remove(jobId: number): Promise<void> {
    try {
      await getQdrant().delete(COLLECTION_NAME, { wait: true, points: [jobId] })
      console.log(`--- [Vector] Removed JD id: ${jobId} ---`)
    } catch (err) {
      console.error(`--- [Vector] Error removing JD ${jobId}:`, (err as Error).message)
      throw err
    }
  },

  /** Closest jobs to a resume embedding, compared on the `full` vector. */
  async searchByFullVector(vector: number[], limit: number) {
    const { points } = await getQdrant().query(COLLECTION_NAME, {
      query: vector,
      using: 'full',
      limit,
      with_payload: true
    })
    return points
  },

  /** The stored named vectors of one job, or null if it isn't indexed. */
  async retrieveVectors(jobId: number) {
    const points = await getQdrant().retrieve(COLLECTION_NAME, { ids: [jobId], with_vector: true })
    return points.length > 0 ? points[0]!.vector as Record<string, number[]> : null
  }
}
