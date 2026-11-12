import pg from 'pg'
import { afterAll } from 'vitest'
import { TEST_DATABASE_URL } from '../setup/test-env'

let pool: pg.Pool | null = null

export const db = () => {
  if (!pool) pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 })
  return pool
}

afterAll(async () => {
  await pool?.end()
  pool = null
})

/** Empties every table except the default templates the server seeds at boot. */
export const resetDb = async () => {
  await db().query(`
    TRUNCATE job_roles, candidates, scan_timestamps, interview_events, interview_candidates, google_forms
    RESTART IDENTITY CASCADE;
    DELETE FROM email_templates WHERE is_default = false;
  `)
}

// Fixtures are inserted directly so tests don't depend on Google, Qdrant or the embedding model.

export const insertJob = async (fields: Record<string, unknown> = {}) => {
  const row = { role: 'Backend Developer', salary_min: 1000000, salary_max: 1200000, skills: 'node, sql', experience_min_years: 2, location: 'Remote', ...fields }
  const cols = Object.keys(row)
  const { rows } = await db().query(
    `INSERT INTO job_roles (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    Object.values(row)
  )
  return rows[0]
}

export const insertCandidate = async (fields: Record<string, unknown> = {}) => {
  const row = {
    name: 'Asha Rao',
    email: `asha.${Math.random().toString(36).slice(2, 8)}@example.com`,
    phone: '9876543210',
    role_applied: 'Backend Developer',
    score: 70,
    status: 'shortlisted',
    applied_through: 'Gmail',
    ...fields
  }
  const cols = Object.keys(row)
  const { rows } = await db().query(
    `INSERT INTO candidates (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    Object.values(row)
  )
  return rows[0]
}

export const insertEvent = async (fields: Record<string, unknown> = {}) => {
  const row = { role: 'Backend Developer', event_date: '2030-01-15', start_time: '10:00', end_time: '13:00', num_candidates: 2, extra_candidates: 0, ...fields }
  const cols = Object.keys(row)
  const { rows } = await db().query(
    `INSERT INTO interview_events (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    Object.values(row)
  )
  return rows[0]
}

export const assignCandidate = async (eventId: number, candidateId: number, inviteSent = false) => {
  await db().query(
    'INSERT INTO interview_candidates (event_id, candidate_id, invite_sent) VALUES ($1, $2, $3)',
    [eventId, candidateId, inviteSent]
  )
}

export const insertForm = async (fields: Record<string, unknown> = {}) => {
  const row = {
    form_id: `form-${Math.random().toString(36).slice(2, 10)}`,
    form_url: 'https://docs.google.com/forms/d/e/fake/viewform',
    form_title: 'Job Application: Backend Developer',
    question_map: JSON.stringify({ resume: 'q1', email: 'q2' }),
    ...fields
  }
  const cols = Object.keys(row)
  const { rows } = await db().query(
    `INSERT INTO google_forms (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    Object.values(row)
  )
  return rows[0]
}
