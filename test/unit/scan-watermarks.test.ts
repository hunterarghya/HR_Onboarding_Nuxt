import { beforeEach, describe, expect, it, vi } from 'vitest'

const getWatermark = vi.fn()
const setWatermark = vi.fn()
const collectFromGmail = vi.fn()
const collectFromForm = vi.fn()
const processAttachments = vi.fn()

vi.mock('~~/server/features/auth/users.repository', () => ({ usersRepository: { findById: async () => ({ email: 'hr@example.com' }) } }))
vi.mock('~~/server/features/auth/google-auth.service', () => ({ googleAuthService: { getAuthClientForUser: async () => ({}) } }))
vi.mock('~~/server/features/ingestion/scan-state.repository', () => ({ scanStateRepository: { getWatermark, setWatermark } }))
vi.mock('~~/server/features/ingestion/sources/gmail.source', () => ({ collectFromGmail }))
vi.mock('~~/server/features/ingestion/sources/google-forms.source', () => ({ collectFromForm }))
vi.mock('~~/server/features/ingestion/sources/whatsapp.source', () => ({ collectFromGroup: vi.fn(), isWhatsAppReady: () => false, whatsAppStatus: () => 'qr' }))
vi.mock('~~/server/features/ingestion/pipeline/candidate-pipeline', () => ({ processAttachments }))
vi.mock('~~/server/features/google-forms/google-forms.repository', () => ({
  googleFormsRepository: { findForScan: async () => [{ form_id: 'f1', form_title: 'A', question_map: {} }, { form_id: 'f2', form_title: 'B', question_map: {} }] }
}))
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

const { ingestionService } = await import('../../server/features/ingestion/ingestion.service')

// BUG-06: a watermark that moves before processing loses every resume of a failed run.
describe('scan watermarks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWatermark.mockResolvedValue(new Date('2030-01-01T00:00:00Z'))
    collectFromGmail.mockResolvedValue([{ filename: 'cv.pdf', data: 'x', source: 'Gmail' }])
    collectFromForm.mockResolvedValue([])
  })

  it('Gmail: stays put when processing fails, so the retry reads the same emails', async () => {
    processAttachments.mockRejectedValue(new Error('database unavailable'))
    await expect(ingestionService.runGmailScan(1)).rejects.toThrow('Email scan failed: database unavailable')
    expect(setWatermark).not.toHaveBeenCalled()
  })

  it('Gmail: moves to the time the scan started, after processing succeeded', async () => {
    processAttachments.mockResolvedValue(1)
    const before = Date.now()
    await ingestionService.runGmailScan(1)
    const after = Date.now()

    expect(setWatermark).toHaveBeenCalledTimes(1)
    const [source, id, at] = setWatermark.mock.calls[0]!
    expect([source, id]).toEqual(['gmail', 'default'])
    expect(at.getTime()).toBeGreaterThanOrEqual(before)
    expect(at.getTime()).toBeLessThanOrEqual(after)
    expect(processAttachments.mock.invocationCallOrder[0]).toBeLessThan(setWatermark.mock.invocationCallOrder[0]!)
  })

  it('Forms: only forms that were read successfully move, and only after processing', async () => {
    collectFromForm.mockImplementation(async (_auth: unknown, form: { form_id: string }) => {
      if (form.form_id === 'f2') throw new Error('403 from Google')
      return []
    })
    processAttachments.mockResolvedValue(0)
    await ingestionService.runFormsScan(1, [])
    expect(setWatermark.mock.calls.map(c => c.slice(0, 2))).toEqual([['google_forms', 'f1']])
  })
})
