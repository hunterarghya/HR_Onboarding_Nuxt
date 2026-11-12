import { beforeEach, describe, expect, it, vi } from 'vitest'
import { candidatesRepository, type ResumeCandidate } from '../../server/features/candidates/candidates.repository'
import { db, insertJob, resetDb } from './helpers/db'

// Who counts as the same candidate when a resume is saved (DATA-01). Runs the repository against the
// test database; the app's own pool (and the app settings it reads) is swapped for the test pool.
vi.mock('~~/server/core/db/pool', async () => ({ getPool: (await import('./helpers/db')).db }))

beforeEach(resetDb)

const resume = (over: Partial<ResumeCandidate> = {}): ResumeCandidate => ({
  name: 'Asha Rao',
  email: null,
  phone: null,
  job_role_id: null,
  role_applied: 'Open',
  resume_content: 'resume text',
  score: 70,
  experience_years: null,
  status: 'applied',
  resume_url: null,
  applied_through: 'Gmail',
  current_location: null,
  current_ctc: null,
  ...over
})

const candidates = async () => (await db().query('SELECT name, email, score FROM candidates ORDER BY id')).rows

describe('saving candidates from resumes', () => {
  it('keeps two resumes without an email as two candidates (they used to overwrite each other)', async () => {
    expect(await candidatesRepository.saveFromResume(resume({ name: 'First' }), db())).toBe(true)
    expect(await candidatesRepository.saveFromResume(resume({ name: 'Second' }), db())).toBe(true)
    expect(await candidates()).toEqual([
      { name: 'First', email: null, score: 70 },
      { name: 'Second', email: null, score: 70 }
    ])
  })

  it('updates the candidate when the same email applies to the same job again, ignoring case', async () => {
    const job = await insertJob()
    expect(await candidatesRepository.saveFromResume(resume({ email: 'asha@example.org', job_role_id: job.id }), db())).toBe(true)
    expect(await candidatesRepository.saveFromResume(resume({ email: 'ASHA@example.org', job_role_id: job.id, score: 88 }), db())).toBe(false)
    expect(await candidates()).toEqual([{ name: 'Asha Rao', email: 'asha@example.org', score: 88 }])
  })

  it('treats the same email in the Open pool as the same candidate too', async () => {
    await candidatesRepository.saveFromResume(resume({ email: 'open@example.org' }), db())
    expect(await candidatesRepository.saveFromResume(resume({ email: 'open@example.org', score: 40 }), db())).toBe(false)
    expect(await candidates()).toHaveLength(1)
  })

  it('keeps the same email for different jobs as separate candidates', async () => {
    const a = await insertJob({ role: 'Job A' })
    const b = await insertJob({ role: 'Job B' })
    await candidatesRepository.saveFromResume(resume({ email: 'asha@example.org', job_role_id: a.id }), db())
    await candidatesRepository.saveFromResume(resume({ email: 'asha@example.org', job_role_id: b.id }), db())
    expect(await candidates()).toHaveLength(2)
  })

  it('lets the database refuse a duplicate written around the app', async () => {
    await db().query(`INSERT INTO candidates (name, email, role_applied) VALUES ('x', 'dup@example.org', 'Open')`)
    await expect(db().query(`INSERT INTO candidates (name, email, role_applied) VALUES ('y', 'DUP@example.org', 'Open')`))
      .rejects.toThrow(/candidates_identity/)
  })
})
