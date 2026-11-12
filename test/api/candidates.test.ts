import { beforeAll, describe, expect, it } from 'vitest'
import { api, expectError } from './helpers/http'
import { itRequiresLogin, userToken } from './helpers/auth'
import { db, insertCandidate, resetDb } from './helpers/db'

beforeAll(resetDb)

describe('GET /api/candidates', () => {
  beforeAll(async () => {
    await insertCandidate({ name: 'Low Score', score: 40, date_applied: '2030-01-01T10:00:00Z' })
    await insertCandidate({ name: 'Mid Score', score: 60, date_applied: '2030-01-02T10:00:00Z' })
    await insertCandidate({ name: 'High Score', score: 90, date_applied: '2030-01-03T10:00:00Z', status: 'rejected', role_applied: 'Designer' })
  })

  it('returns a page newest first with a cursor', async () => {
    const res = await api('GET', '/api/candidates', { query: { limit: 2 } })
    expect(res.status).toBe(200)
    expect(res.body.data.map((c: any) => c.name)).toEqual(['High Score', 'Mid Score'])
    expect(res.body).toMatchObject({ hasNextPage: true, nextCursor: expect.stringMatching(/^[\w-]+$/) })

    const next = await api('GET', '/api/candidates', { query: { limit: 2, cursor: res.body.nextCursor } })
    expect(next.body).toMatchObject({ hasNextPage: false, nextCursor: null })
    expect(next.body.data.map((c: any) => c.name)).toEqual(['Low Score'])
  })

  it('sorts by score and filters', async () => {
    const sorted = await api('GET', '/api/candidates', { query: { scoreSort: 'lowToHigh' } })
    expect(sorted.body.data.map((c: any) => c.score)).toEqual([40, 60, 90])

    const filtered = await api('GET', '/api/candidates', { query: { role: 'Backend Developer', status: 'shortlisted', name: 'score', minScore: 50 } })
    expect(filtered.body.data.map((c: any) => c.name)).toEqual(['Mid Score'])
  })

  it('rejects non-numeric limit and score filters (400, were 500 crashes)', async () => {
    expectError(await api('GET', '/api/candidates', { query: { limit: 'abc' } }), 400, 'Validation failed')
    expectError(await api('GET', '/api/candidates', { query: { minScore: 'high' } }), 400, 'Validation failed')
  })
})

describe('PATCH /api/candidates/:id/status', () => {
  it('updates a plain status', async () => {
    const c = await insertCandidate()
    const res = await api('PATCH', `/api/candidates/${c.id}/status`, { body: { status: 'rejected' } })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Status updated successfully' })
  })

  it('requires all offer fields for "selected" (400)', async () => {
    const c = await insertCandidate()
    const res = await api('PATCH', `/api/candidates/${c.id}/status`, { body: { status: 'selected', offered_role: 'SDE' } })
    expectError(res, 400)
  })

  it('stores the offer for "selected"', async () => {
    const c = await insertCandidate()
    const res = await api('PATCH', `/api/candidates/${c.id}/status`, {
      body: { status: 'selected', offered_role: 'SDE', offered_salary: 1000000, offered_location: 'Pune', joining_date: '2030-03-01' }
    })
    expect(res.status).toBe(200)
    const { rows } = await db().query('SELECT status, offered_role FROM candidates WHERE id = $1', [c.id])
    expect(rows[0]).toEqual({ status: 'selected', offered_role: 'SDE' })
  })

  it.each([
    ['an unknown status', { status: 'banana' }],
    ['a missing status', {}],
    ['offer fields on a non-selected status', { status: 'hold', offered_role: 'SDE' }],
    ['text as offered salary', { status: 'selected', offered_role: 'SDE', offered_salary: '12 LPA', offered_location: 'Pune', joining_date: '2030-03-01' }],
    ['a malformed joining date', { status: 'selected', offered_role: 'SDE', offered_salary: 1000000, offered_location: 'Pune', joining_date: '1st March' }]
  ])('rejects %s (400)', async (_label, body) => {
    const c = await insertCandidate()
    expectError(await api('PATCH', `/api/candidates/${c.id}/status`, { body }), 400)
  })

  it('returns 404 for an unknown candidate (it used to say "updated")', async () => {
    expectError(await api('PATCH', '/api/candidates/999999/status', { body: { status: 'hold' } }), 404)
  })

  it('stores the offered salary as a number', async () => {
    const c = await insertCandidate()
    await api('PATCH', `/api/candidates/${c.id}/status`, {
      body: { status: 'selected', offered_role: 'SDE', offered_salary: 1250000.5, offered_location: 'Pune', joining_date: '2030-03-01' }
    })
    const res = await api('GET', '/api/candidates/selected', { query: { offered_role: 'SDE', limit: 100 } })
    expect(res.body.data.find((x: { id: number }) => x.id === c.id)?.offered_salary).toBe(1250000.5) // a number, not '1250000.50'
  })

  it('the database refuses an unknown status written around the API', async () => {
    const c = await insertCandidate()
    await expect(db().query('UPDATE candidates SET status = \'banana\' WHERE id = $1', [c.id])).rejects.toThrow(/candidates_status_check/)
  })
})

describe('GET /api/candidates/selected', () => {
  beforeAll(async () => {
    await insertCandidate({ name: 'Sel A', status: 'selected', offered_role: 'SDE', offered_location: 'Pune', joining_date: '2030-02-01', offer_sent: false })
    await insertCandidate({ name: 'Sel B', status: 'selected', offered_role: 'QA', offered_location: 'Delhi', joining_date: '2030-02-10', offer_sent: true })
  })

  it('pages selected candidates by joining date', async () => {
    const res = await api('GET', '/api/candidates/selected', { query: { limit: 1, offered_role: 'SDE' } })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(Object.keys(res.body.data[0]).sort()).toEqual(
      ['email', 'id', 'joining_date', 'name', 'offer_sent', 'offered_location', 'offered_role', 'offered_salary', 'phone', 'status']
    )
    expect(res.body).toHaveProperty('hasNextPage')
    expect(res.body).toHaveProperty('nextCursor')
  })

  it('filters by offer_sent', async () => {
    const res = await api('GET', '/api/candidates/selected', { query: { offer_sent: 'true' } })
    expect(res.body.data.map((c: any) => c.name)).toEqual(['Sel B'])
  })
})

describe('paging', () => {
  /** Every name across all pages, following nextCursor. */
  const allPages = async (path: string, query: Record<string, unknown>) => {
    const names: string[] = []
    let cursor: string | undefined
    for (let i = 0; i < 20; i++) {
      const res = await api('GET', path, { query: { ...query, limit: 2, ...(cursor ? { cursor } : {}) } })
      expect(res.status).toBe(200)
      names.push(...res.body.data.map((c: { name: string }) => c.name))
      if (!res.body.hasNextPage) return names
      cursor = res.body.nextCursor
    }
    throw new Error('paging never ended')
  }

  beforeAll(async () => {
    const same = '2031-05-05T10:00:00.123456Z' // same millisecond, different microseconds below
    await insertCandidate({ name: 'P1', role_applied: 'Paging QA', score: 80, date_applied: '2031-05-01T10:00:00Z' })
    await insertCandidate({ name: 'P2', role_applied: 'Paging QA', score: null, date_applied: '2031-05-02T10:00:00Z' })
    await insertCandidate({ name: 'P3', role_applied: 'Paging QA', score: null, date_applied: '2031-05-03T10:00:00Z' })
    await insertCandidate({ name: 'P4', role_applied: 'Paging QA', score: 50, date_applied: same })
    await insertCandidate({ name: 'P5', role_applied: 'Paging QA', score: 50, date_applied: '2031-05-05T10:00:00.123999Z' })
    await insertCandidate({ name: 'S1', status: 'selected', offered_role: 'Paging QA', joining_date: '2031-01-02' })
    await insertCandidate({ name: 'S2', status: 'selected', offered_role: 'Paging QA', joining_date: null })
    await insertCandidate({ name: 'S3', status: 'selected', offered_role: 'Paging QA', joining_date: '2031-01-01' })
  })

  it.each([
    ['newest', ['P5', 'P4', 'P3', 'P2', 'P1']],
    ['highToLow', ['P1', 'P5', 'P4', 'P3', 'P2']], // unscored candidates come last instead of vanishing (BUG-08)
    ['lowToHigh', ['P3', 'P2', 'P5', 'P4', 'P1']]
  ])('walks every candidate exactly once (%s)', async (scoreSort, expected) => {
    expect(await allPages('/api/candidates', { role: 'Paging QA', scoreSort })).toEqual(expected)
  })

  it('walks selected candidates by joining date, those without one last', async () => {
    expect(await allPages('/api/candidates/selected', { offered_role: 'Paging QA' })).toEqual(['S3', 'S1', 'S2'])
  })

  it('returns joining dates as plain calendar days', async () => {
    const res = await api('GET', '/api/candidates/selected', { query: { offered_role: 'Paging QA' } })
    expect(res.body.data[0].joining_date).toBe('2031-01-01')
  })

  it.each([
    ['/api/candidates', { cursor: '60|2030-01-01|1' }], // the old hand-built format
    ['/api/candidates', { cursor: 'eyJzY29yZSI6Imhp' }],
    ['/api/candidates/selected', { cursor: 'not a cursor' }],
    ['/api/candidates', { limit: 0 }],
    ['/api/candidates', { limit: 101 }],
    ['/api/candidates', { scoreSort: 'random' }],
    ['/api/candidates', { status: 'banana' }],
    ['/api/candidates', { minScore: 150 }],
    ['/api/candidates/selected', { dateFrom: 'last week' }],
    ['/api/candidates/selected', { offer_sent: 'maybe' }]
  ])('rejects bad input on %s %o (400)', async (path, query) => {
    expectError(await api('GET', path, { query }), 400)
  })
})

describe('GET /api/candidates/selected/filters', () => {
  it('returns distinct offered roles and locations', async () => {
    const res = await api('GET', '/api/candidates/selected/filters')
    expect(res.status).toBe(200)
    expect(res.body.roles).toEqual(expect.arrayContaining(['QA', 'SDE']))
    expect(res.body.locations).toEqual(expect.arrayContaining(['Delhi', 'Pune']))
  })
})

describe('GET /api/candidates/scan-status', () => {
  itRequiresLogin('GET', '/api/candidates/scan-status')

  it('returns the last scan time per source', async () => {
    await db().query(`INSERT INTO scan_timestamps (source_type, source_id, last_scanned_at) VALUES
      ('gmail', 'default', '2030-01-01T00:00:00Z'),
      ('whatsapp', 'g1', '2030-01-02T00:00:00Z'),
      ('whatsapp', 'g2', '2030-01-05T00:00:00Z')`)
    const res = await api('GET', '/api/candidates/scan-status', { token: userToken() })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      gmail: { lastScannedAt: expect.any(String), running: false },
      whatsapp: { lastScannedAt: expect.any(String), running: false },
      google_forms: { lastScannedAt: null, running: false }
    })
    expect(new Date(res.body.whatsapp.lastScannedAt).getUTCDate()).toBe(5)
  })
})
