import { describe, expect, it } from 'vitest'
import { planCalendarSync } from '../../server/features/interviews/calendar-sync.plan'

const existing = [
  { id: 1, google_event_id: 'old-interview' }, // last month: outside the fetched window
  { id: 2, google_event_id: 'kept' },
  { id: 3, google_event_id: 'cancelled-in-google' }
]

describe('planCalendarSync', () => {
  it('keeps imported events that are simply outside the fetched window (BUG-01: they were deleted)', () => {
    const plan = planCalendarSync(existing, [{ id: 'kept', status: 'confirmed' }])
    expect(plan.toDelete).toEqual([])
  })

  it('deletes only events Google reports as cancelled', () => {
    const plan = planCalendarSync(existing, [
      { id: 'kept', status: 'confirmed' },
      { id: 'cancelled-in-google', status: 'cancelled' },
      { id: 'never-imported', status: 'cancelled' }
    ])
    expect(plan.toDelete).toEqual([{ id: 3, googleEventId: 'cancelled-in-google' }])
  })

  it('imports live events that are new, and counts the ones already imported', () => {
    const plan = planCalendarSync(existing, [
      { id: 'kept', status: 'confirmed' },
      { id: 'new-one', status: 'confirmed' },
      { id: 'new-tentative', status: 'tentative' },
      { id: 'new-but-cancelled', status: 'cancelled' },
      { status: 'confirmed' } // no id: nothing to link it by
    ])
    expect(plan.toImport.map(e => e.id)).toEqual(['new-one', 'new-tentative'])
    expect(plan.alreadyImported).toBe(1)
  })
})
