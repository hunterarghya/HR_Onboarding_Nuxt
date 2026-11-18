import { describe, expect, it } from 'vitest'
import { QUEUE_NAMES } from '../../server/core/tasks/queues'
import { QUEUE_TITLES, taskSummary, taskTitle } from '../../server/core/tasks/task-labels'

// The Tasks page shows these instead of internal names and raw results.

describe('task titles', () => {
  it('names every queue in plain words', () => {
    for (const q of QUEUE_NAMES) expect(QUEUE_TITLES[q]).toMatch(/^[A-Z][a-z ]+$/)
  })

  it.each([
    ['calendar.renewChannels', {}, 'Keep Google Calendar updates coming'],
    ['scan.gmail', { userId: 1 }, 'Scan Gmail for resumes'],
    ['mail.offers', { userId: 1, templateId: 2, candidateIds: [3] }, 'Send offer letters'],
    ['vectors.syncJob', { jobId: 7, role: 'Backend developer' }, 'Prepare “Backend developer” for resume matching'],
    ['vectors.syncJob', { jobId: 7 }, 'Prepare a job for resume matching']
  ])('%s → %s', (name, data, title) => {
    expect(taskTitle(name, data)).toBe(title)
  })

  it('keeps the internal name of a task it does not know', () => {
    expect(taskTitle('something.new', {})).toBe('something.new')
  })
})

describe('task summaries', () => {
  it.each([
    ['scan.gmail', { message: 'Email scan complete', count: 3 }, '3 new candidates found'],
    ['scan.whatsapp', { message: 'WhatsApp scan complete', count: 0 }, 'No new candidates found'],
    ['scan.forms', { message: 'No Google Forms configured', count: 0 }, 'No Google Forms configured'],
    ['calendar.sync', { message: 'Calendar sync complete', imported: 2, deleted: 1 }, '2 events imported, 1 removed'],
    ['calendar.sync', { message: 'No active job roles found', imported: 0 }, '0 events imported'],
    ['calendar.renewChannels', { renewed: 0, failed: 0 }, 'Nothing needed renewing'],
    ['calendar.renewChannels', { renewed: 1, failed: 1 }, '1 calendar renewed, 1 failed'],
    ['mail.offers', { message: 'Offer letters processed', sent: 2, failed: 0, skipped: 1, total: 3 }, '2 emails sent · 1 skipped (already sent)'],
    ['vectors.syncJob', { indexed: 7, role: 'Backend developer' }, '“Backend developer” is ready to match resumes'],
    ['vectors.syncJob', { skipped: 'job no longer exists' }, 'Skipped: the job was deleted'],
    ['vectors.resyncAll', { indexed: 0 }, 'No jobs to prepare yet']
  ])('%s %j → %s', (name, result, summary) => {
    expect(taskSummary(name, result)).toBe(summary)
  })

  it('says nothing for a missing result', () => {
    expect(taskSummary('scan.gmail', null)).toBe('')
  })
})
