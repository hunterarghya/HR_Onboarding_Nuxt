/**
 * Vector Matching Service
 * Uses Qdrant + BAAI/bge-small-en-v1.5 embeddings for resume-to-JD matching.
 */

import { QdrantClient } from '@qdrant/js-client-rest'

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333'
const COLLECTION_NAME = 'job_descriptions'
const VECTOR_SIZE = 384

const qdrant = new QdrantClient({ url: QDRANT_URL })

let pipeline: any = null

const getEmbeddingPipeline = async () => {
  if (pipeline) return pipeline
  console.log('--- [Vector] Loading embedding model: BAAI/bge-small-en-v1.5 ---')
  const { pipeline: createPipeline } = await import('@xenova/transformers')
  pipeline = await createPipeline('feature-extraction', 'Xenova/bge-small-en-v1.5')
  console.log('--- [Vector] Embedding model loaded ---')
  return pipeline
}

export const embed = async (text: string): Promise<number[]> => {
  const pipe = await getEmbeddingPipeline()
  const truncated = text.substring(0, 8000)
  const output = await pipe(truncated, { pooling: 'mean', normalize: true })
  return Array.from(output.data)
}

export const initCollection = async (): Promise<void> => {
  try {
    const collections = await qdrant.getCollections()
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME)
    if (!exists) {
      await qdrant.createCollection(COLLECTION_NAME, {
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
  } catch (err: any) {
    console.error('--- [Vector] Error initializing Qdrant collection:', err.message)
  }
}

export const upsertJobDescription = async (job: any): Promise<void> => {
  try {
    const fullText = `${job.role}. ${job.skills || ''}. ${job.qualification || ''}. ${job.experience || ''}. ${job.location || ''}`
    const skillsText = job.skills || job.role
    const experienceText = job.experience || 'Any experience'

    const [fullVec, skillsVec, expVec] = await Promise.all([
      embed(fullText),
      embed(skillsText),
      embed(experienceText)
    ])

    await qdrant.upsert(COLLECTION_NAME, {
      wait: true,
      points: [{
        id: job.id,
        vector: { full: fullVec, skills: skillsVec, experience: expVec },
        payload: {
          role: job.role,
          skills: job.skills,
          experience: job.experience,
          shortlist_mode: job.shortlist_mode,
          min_score: job.min_score,
          criteria_weights: job.criteria_weights || null
        }
      }]
    })
    console.log(`--- [Vector] Upserted JD: ${job.role} (id: ${job.id}) ---`)
  } catch (err: any) {
    console.error(`--- [Vector] Error upserting JD ${job.role}:`, err.message)
  }
}

export const removeJobDescription = async (jobId: number): Promise<void> => {
  try {
    await qdrant.delete(COLLECTION_NAME, { wait: true, points: [jobId] })
    console.log(`--- [Vector] Removed JD id: ${jobId} ---`)
  } catch (err: any) {
    console.error(`--- [Vector] Error removing JD ${jobId}:`, err.message)
  }
}

const toScore = (similarity: number): number => {
  return Math.round(Math.min(100, Math.max(0, similarity * 100)))
}

const cosineSimilarity = (a: number[], b: number[]): number => {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export const matchResumeToJobs = async (
  resumeText: string,
  sections: { skills: string; projects: string; experience: string },
  jobRoles: any[]
): Promise<{ target_role: string; score: number }> => {
  try {
    console.log('--- [Vector] Starting Match Process ---')
    const resumeVec = await embed(resumeText)

    const searchResult = await qdrant.search(COLLECTION_NAME, {
      vector: { name: 'full', vector: resumeVec },
      limit: 3,
      with_payload: true
    })

    if (!searchResult || searchResult.length === 0) {
      console.log('--- [Vector] No matching job descriptions found in Qdrant. ---')
      return { target_role: 'Open', score: 0 }
    }

    console.log('--- [Vector] Top 3 Semantic Matches: ---')
    searchResult.forEach((res, i) => {
      console.log(`      ${i + 1}. ${(res.payload as any).role} (Score: ${toScore(res.score)}%)`)
    })

    const topMatch = searchResult[0]!
    const topScore = topMatch.score

    if (topScore < 0.55) {
      console.log(`--- [Vector] Top score ${toScore(topScore)}% is below 55%. Assigning to "Open". ---`)
      return { target_role: 'Open', score: toScore(topScore) }
    }

    const targetRole = (topMatch.payload as any).role
    const jobId = topMatch.id as number

    console.log(`--- [Vector] Selected Candidate Role: ${targetRole} ---`)

    const job = jobRoles.find(j => j.id === jobId)
    const criteriaWeights = job?.criteria_weights

    let finalScore: number

    if (criteriaWeights && Object.keys(criteriaWeights).length > 0) {
      console.log(`--- [Vector] Computing Weighted Score for ${targetRole} ---`)
      console.log(`      Weights: ${JSON.stringify(criteriaWeights)}`)

      const sectionEmbeddings: Record<string, number[]> = {}

      if (criteriaWeights.skills !== undefined && sections.skills) {
        sectionEmbeddings.skills = await embed(sections.skills)
      }
      if (criteriaWeights.projects !== undefined && sections.projects) {
        sectionEmbeddings.projects = await embed(sections.projects)
      }
      if (criteriaWeights.experience !== undefined && sections.experience) {
        sectionEmbeddings.experience = await embed(sections.experience)
      }

      const jobPoint = await qdrant.retrieve(COLLECTION_NAME, {
        ids: [jobId],
        with_vector: true
      })

      if (jobPoint && jobPoint.length > 0) {
        const jobVectors = jobPoint[0]!.vector as Record<string, number[]>
        let weightedSum = 0
        let totalWeight = 0

        if (criteriaWeights.skills !== undefined && sectionEmbeddings.skills) {
          const sim = cosineSimilarity(sectionEmbeddings.skills, jobVectors.skills!)
          console.log(`      -> Skills Similarity: ${toScore(sim)}% (Weight: ${criteriaWeights.skills})`)
          weightedSum += criteriaWeights.skills * sim
          totalWeight += criteriaWeights.skills
        }

        if (criteriaWeights.projects !== undefined && sectionEmbeddings.projects) {
          const sim = cosineSimilarity(sectionEmbeddings.projects, jobVectors.full!)
          console.log(`      -> Projects Similarity: ${toScore(sim)}% (Weight: ${criteriaWeights.projects})`)
          weightedSum += criteriaWeights.projects * sim
          totalWeight += criteriaWeights.projects
        }

        if (criteriaWeights.experience !== undefined && sectionEmbeddings.experience) {
          const sim = cosineSimilarity(sectionEmbeddings.experience, jobVectors.experience!)
          console.log(`      -> Experience Similarity: ${toScore(sim)}% (Weight: ${criteriaWeights.experience})`)
          weightedSum += criteriaWeights.experience * sim
          totalWeight += criteriaWeights.experience
        }

        if (totalWeight > 0) {
          const weightedSimilarity = weightedSum / totalWeight
          finalScore = toScore(weightedSimilarity)
          console.log(`      -> Final Weighted Score: ${finalScore}%`)
        } else {
          finalScore = toScore(topScore)
          console.log(`      -> No section matches found, falling back to Full Score: ${finalScore}%`)
        }
      } else {
        finalScore = toScore(topScore)
        console.log(`      -> Job vectors not found in Qdrant, falling back to Full Score: ${finalScore}%`)
      }
    } else {
      finalScore = toScore(topScore)
      console.log(`--- [Vector] No criteria weights for ${targetRole}. Using Full Score: ${finalScore}% ---`)
    }

    return { target_role: targetRole, score: finalScore }
  } catch (err: any) {
    console.error('--- [Vector] Error in matchResumeToJobs:', err.message)
    return { target_role: 'Open', score: 0 }
  }
}
