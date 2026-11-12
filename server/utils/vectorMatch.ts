/**
 * Vector Matching Service
 * Job descriptions in Qdrant + BAAI/bge-small-en-v1.5 embeddings for resume-to-JD matching.
 * The Qdrant client and the embedding model live in integrations/.
 */

import { embed } from '~~/server/integrations/embeddings/embedder'
import { jobVectorsRepository } from '~~/server/modules/job-roles/job-vectors.repository'

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
  sections: { skills: string, projects: string, experience: string },
  jobRoles: any[]
): Promise<{ target_role: string, score: number }> => {
  try {
    console.log('--- [Vector] Starting Match Process ---')
    const resumeVec = await embed(resumeText)

    // search() was removed from the client in 1.x; query() is its replacement
    const searchResult = await jobVectorsRepository.searchByFullVector(resumeVec, 3)

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

      const jobVectors = await jobVectorsRepository.retrieveVectors(jobId)

      if (jobVectors) {
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
