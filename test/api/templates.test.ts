import { beforeAll, describe, expect, it } from 'vitest'
import { api, expectError } from './helpers/http'
import { db, resetDb } from './helpers/db'

beforeAll(resetDb)

const createTemplate = async (fields: Record<string, unknown> = {}) => {
  const res = await api('POST', '/api/templates', { body: { name: 'Follow-up', subject: 'Hi {{name}}', body: '<p>Hello {{name}}</p>', ...fields } })
  expect(res.status).toBe(201)
  return res.body
}

const defaultTemplateId = async (type: string): Promise<number> => {
  const { rows } = await db().query('SELECT id FROM email_templates WHERE is_default = true AND type = $1', [type])
  return rows[0].id
}

describe('GET /api/templates', () => {
  it('lists the three seeded defaults, ordered by type', async () => {
    const res = await api('GET', '/api/templates')
    expect(res.status).toBe(200)
    expect(res.body.map((t: any) => t.type)).toEqual(['invite', 'offer', 'rejection'])
    expect(res.body[0]).toMatchObject({ id: expect.any(Number), name: 'Interview Invitation', is_default: true })
  })
})

describe('POST /api/templates', () => {
  it('creates a custom template with defaults', async () => {
    const res = await api('POST', '/api/templates', { body: { name: 'Plain', body: '<p>x</p>' } })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ name: 'Plain', subject: '', body: '<p>x</p>', type: 'custom', is_default: false })
  })

  it('requires name and body (400)', async () => {
    expectError(await api('POST', '/api/templates', { body: { name: 'x' } }), 400, 'Validation failed')
  })

  it.each([
    ['an unknown type', { name: 'x', body: 'y', type: 'birthday' }],
    ['a blank name', { name: '  ', body: 'y' }],
    ['a blank body', { name: 'x', body: '   ' }],
    ['a too-long subject', { name: 'x', body: 'y', subject: 's'.repeat(501) }],
    ['broken template syntax in the body', { name: 'x', body: 'Hi {{#if name}}' }],
    ['broken template syntax in the subject', { name: 'x', body: 'y', subject: 'Hi {{name' }],
    ['an unknown field', { name: 'x', body: 'y', is_default: true }]
  ])('rejects %s (400)', async (_label, body) => {
    expectError(await api('POST', '/api/templates', { body }), 400, 'Validation failed')
  })
})

describe('GET /api/templates/:id', () => {
  it('returns one template', async () => {
    const tpl = await createTemplate()
    const res = await api('GET', `/api/templates/${tpl.id}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: tpl.id, name: 'Follow-up' })
  })

  it('returns 404 for an unknown id', async () => {
    expectError(await api('GET', '/api/templates/999999'), 404, 'Template not found')
  })

  it('rejects a non-numeric id (400, was a 500 crash)', async () => {
    expectError(await api('GET', '/api/templates/abc'), 400, 'Validation failed')
  })
})

describe('PUT /api/templates/:id', () => {
  it('replaces the template', async () => {
    const tpl = await createTemplate()
    const res = await api('PUT', `/api/templates/${tpl.id}`, { body: { name: 'Renamed', body: '<p>new</p>', type: 'invite' } })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: tpl.id, name: 'Renamed', subject: '', body: '<p>new</p>', type: 'invite' })
  })

  it('requires name and body (400)', async () => {
    const tpl = await createTemplate()
    expectError(await api('PUT', `/api/templates/${tpl.id}`, { body: { name: 'x' } }), 400, 'Validation failed')
  })

  it('refuses to change a default template (403)', async () => {
    const { rows } = await db().query('SELECT id FROM email_templates WHERE is_default LIMIT 1')
    expectError(await api('PUT', `/api/templates/${rows[0].id}`, { body: { name: 'x', body: 'y' } }), 403, 'Default templates cannot be changed or deleted')
  })

  it('returns 404 for an unknown id', async () => {
    expectError(await api('PUT', '/api/templates/999999', { body: { name: 'x', body: 'y' } }), 404, 'Template not found')
  })
})

describe('DELETE /api/templates/:id', () => {
  it('deletes, then 404s on the second delete', async () => {
    const tpl = await createTemplate()
    const res = await api('DELETE', `/api/templates/${tpl.id}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Template deleted' })
    expectError(await api('DELETE', `/api/templates/${tpl.id}`), 404, 'Template not found')
  })

  it('refuses to delete a default template (403)', async () => {
    expectError(await api('DELETE', `/api/templates/${await defaultTemplateId('rejection')}`), 403)
  })
})

describe('POST /api/templates/:id/preview', () => {
  it('renders a default template with built-in sample data for its type', async () => {
    const res = await api('POST', `/api/templates/${await defaultTemplateId('offer')}/preview`, { body: {} })
    expect(res.status).toBe(200)
    // {{company_name}} is the previewing HR's own company
    expect(res.body.subject).toBe('Offer of Employment - Senior Backend Developer at Odysseus')
    expect(res.body.body).toContain('Ronit Sharma')
    expect(res.body.sampleData).toMatchObject({ offered_role: 'Senior Backend Developer' })
  })

  it('renders with caller-supplied sample data', async () => {
    const tpl = await createTemplate()
    const res = await api('POST', `/api/templates/${tpl.id}/preview`, { body: { sampleData: { name: 'Zoya' } } })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ subject: 'Hi Zoya', body: '<p>Hello Zoya</p>', sampleData: { name: 'Zoya' } })
  })

  it('returns 404 for an unknown id', async () => {
    expectError(await api('POST', '/api/templates/999999/preview', { body: {} }), 404, 'Template not found')
  })

  it('rejects a request with no body (400, was a 500 crash)', async () => {
    const tpl = await createTemplate()
    expectError(await api('POST', `/api/templates/${tpl.id}/preview`), 400)
  })
})

describe('POST /api/templates/preview-raw', () => {
  it('renders an unsaved template', async () => {
    const res = await api('POST', '/api/templates/preview-raw', { body: { subject: 'For {{name}}', body: '<b>{{role_applied}}</b>', type: 'rejection' } })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ subject: 'For Ronit Sharma', body: '<b>Backend Developer</b>' })
    expect(res.body.sampleData).not.toHaveProperty('offered_role')
  })

  it('requires body (400)', async () => {
    expectError(await api('POST', '/api/templates/preview-raw', { body: { subject: 'x' } }), 400, 'Validation failed')
  })

  it('reports template syntax errors as 400 with the reason (was a 500)', async () => {
    const res = await api('POST', '/api/templates/preview-raw', { body: { body: '{{#if}}' } })
    expectError(res, 400, 'Validation failed')
    expect(JSON.stringify(res.body.data.details)).toContain('Template syntax error')
  })
})
