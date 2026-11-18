import { beforeEach, describe, expect, it, vi } from 'vitest'

// Task vectors.syncJob indexes what is saved, even when the job is edited while it runs.

const findById = vi.fn()
vi.mock('~~/server/features/job-roles/job-roles.repository', () => ({ jobRolesRepository: { findById }, UPDATABLE_FIELDS: [] }))
const upsert = vi.fn(async () => {})
vi.mock('~~/server/features/job-roles/job-vectors.repository', () => ({ jobVectorsRepository: { upsert } }))
vi.mock('~~/server/core/tasks/queues', () => ({ enqueue: vi.fn() }))
vi.mock('~~/server/core/db/transaction', () => ({ withTransaction: vi.fn() }))
vi.mock('~~/server/features/google-forms/google-forms.service', () => ({ googleFormsService: {} }))

const { jobRolesService } = await import('../../server/features/job-roles/job-roles.service')

const job = (skills: string) => ({ id: 7, role: 'Backend developer', skills, qualification: null, experience_min_years: 2, location: null, shortlist_mode: 'manual', min_score: 60, criteria_weights: {} })

describe('syncJobVector', () => {
  beforeEach(() => vi.clearAllMocks())

  it('indexes the job once when nothing changes meanwhile', async () => {
    findById.mockResolvedValue(job('Go'))
    await expect(jobRolesService.syncJobVector(7)).resolves.toEqual({ indexed: 7, role: 'Backend developer' })
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('indexes again when the job was edited while it ran', async () => {
    findById.mockResolvedValueOnce(job('Go')).mockResolvedValueOnce(job('Go, Rust')).mockResolvedValue(job('Go, Rust'))
    await jobRolesService.syncJobVector(7)
    expect(upsert).toHaveBeenCalledTimes(2)
    expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({ skills: 'Go, Rust' }))
  })

  it('skips a job deleted before it ran', async () => {
    findById.mockResolvedValue(null)
    await expect(jobRolesService.syncJobVector(7)).resolves.toEqual({ skipped: 'job no longer exists' })
    expect(upsert).not.toHaveBeenCalled()
  })
})
