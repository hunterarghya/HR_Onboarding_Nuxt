import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobRoleRow } from '../../server/database/types'

// Resume scoring with the embedding model and Qdrant faked: what's tested is the decision logic.

const embed = vi.fn()
const searchByFullVector = vi.fn()
const retrieveVectors = vi.fn()
vi.mock('~~/server/integrations/embeddings/embedder', () => ({ embed }))
vi.mock('~~/server/features/job-roles/job-vectors.repository', () => ({ jobVectorsRepository: { searchByFullVector, retrieveVectors } }))
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

const { matchResumeToJobs } = await import('../../server/features/ingestion/pipeline/resume-scorer')

const job = (over: Partial<JobRoleRow> = {}) => ({ id: 7, role: 'Backend Developer', criteria_weights: {}, ...over }) as JobRoleRow
const sections = { skills: 'node sql', projects: 'built an api', experience: '3 years' }
const hit = (score: number) => [{ id: 7, score, payload: { role: 'Backend Developer' } }]

describe('matchResumeToJobs', () => {
  beforeEach(() => {
    embed.mockReset().mockResolvedValue([1, 0])
    searchByFullVector.mockReset()
    retrieveVectors.mockReset()
  })

  it('matches the best job and scores the similarity out of 100', async () => {
    searchByFullVector.mockResolvedValue(hit(0.82))
    await expect(matchResumeToJobs('resume', sections, [job()])).resolves.toEqual({ target_role: 'Backend Developer', job_role_id: 7, score: 82 })
  })

  it('sends a weak match (under 55%) to Open, keeping its score', async () => {
    searchByFullVector.mockResolvedValue(hit(0.5))
    await expect(matchResumeToJobs('resume', sections, [job()])).resolves.toEqual({ target_role: 'Open', job_role_id: null, score: 50 })
  })

  it('sends a resume to Open when no job is indexed, or the model fails', async () => {
    searchByFullVector.mockResolvedValue([])
    await expect(matchResumeToJobs('resume', sections, [job()])).resolves.toMatchObject({ target_role: 'Open', score: 0 })
    embed.mockRejectedValue(new Error('model missing'))
    await expect(matchResumeToJobs('resume', sections, [job()])).resolves.toMatchObject({ target_role: 'Open', job_role_id: null, score: 0 })
  })

  it('weights the sections by the job\'s criteria', async () => {
    searchByFullVector.mockResolvedValue(hit(0.9))
    // skills match perfectly (cos 1), experience is unrelated (cos 0)
    embed.mockImplementation(async (text: string) => (text === sections.experience ? [0, 1] : [1, 0]))
    retrieveVectors.mockResolvedValue({ full: [1, 0], skills: [1, 0], experience: [1, 0] })
    const weighted = await matchResumeToJobs('resume', sections, [job({ criteria_weights: { skills: 3, experience: 1 } })])
    expect(weighted.score).toBe(75) // (3·1 + 1·0) / 4
  })

  it('falls back to the overall score when the job\'s section vectors are missing', async () => {
    searchByFullVector.mockResolvedValue(hit(0.9))
    retrieveVectors.mockResolvedValue(null)
    await expect(matchResumeToJobs('resume', sections, [job({ criteria_weights: { skills: 1 } })])).resolves.toMatchObject({ score: 90 })
  })
})
