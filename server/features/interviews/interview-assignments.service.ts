import { NotFoundError } from '~~/server/core/errors/app-error'
import { candidatesRepository } from '../candidates/candidates.repository'
import { jobRolesRepository } from '../job-roles/job-roles.repository'
import { interviewAssignmentsRepository } from './interview-assignments.repository'
import { interviewEventsRepository } from './interview-events.repository'

// 'Open Role' events take candidates whose applied role isn't one of the current jobs.
const OPEN_ROLE = 'Open Role'

const getEventOrThrow = async (id: number) => {
  const event = await interviewEventsRepository.findById(id)
  if (!event) throw new NotFoundError('Event')
  return event
}

export const interviewAssignmentsService = {
  listForEvent: (eventId: number) => interviewAssignmentsRepository.listForEvent(eventId),

  /** Manual assignment: the list replaces whatever the event had. */
  async replace(eventId: number, candidateIds: unknown[]) {
    await interviewAssignmentsRepository.replaceForEvent(eventId, candidateIds)
    return candidateIds.length
  },

  /** Candidates who could be put into this event, best score first. */
  async eligibleForEvent(eventId: number) {
    const { role } = await getEventOrThrow(eventId)
    if (role === OPEN_ROLE) {
      return candidatesRepository.findEligibleOutsideRoles(await jobRolesRepository.listRoleNames())
    }
    return candidatesRepository.findEligibleForRole(role)
  },

  /** Fills the event's slots (num + extra) with the best eligible candidates not in another event of the role. */
  async autoAssign(eventId: number) {
    const evt = await getEventOrThrow(eventId)
    const totalSlots = evt.num_candidates + (evt.extra_candidates || 0)
    const excludeIds = await interviewAssignmentsRepository.candidateIdsInOtherEventsOfRole(evt.role, eventId)

    const candidateIds = evt.role === OPEN_ROLE
      ? await candidatesRepository.topEligibleIdsOutsideRoles(await jobRolesRepository.listRoleNames(), excludeIds, totalSlots)
      : await candidatesRepository.topEligibleIdsForRole(evt.role, excludeIds, totalSlots)

    if (candidateIds.length === 0) {
      return { message: 'No eligible candidates found', count: 0 }
    }

    await interviewAssignmentsRepository.replaceForEvent(eventId, candidateIds)
    return { message: 'Candidates auto-assigned successfully', count: candidateIds.length }
  },

  /** Spreads a role's eligible candidates over its events in date order, best scores first. */
  async autoAssignAll(role: string) {
    const events = await interviewEventsRepository.findByRole(role)
    if (events.length === 0) {
      return { message: 'No events found for this role', count: 0 }
    }

    const allCandidates = await candidatesRepository.findEligibleIdsForRole(role)

    let candidateIndex = 0
    let totalAssigned = 0

    for (const evt of events) {
      const totalSlots = evt.num_candidates + (evt.extra_candidates || 0)
      const candidatesForEvent: number[] = []

      while (candidatesForEvent.length < totalSlots && candidateIndex < allCandidates.length) {
        candidatesForEvent.push(allCandidates[candidateIndex]!.id)
        candidateIndex++
      }

      if (candidatesForEvent.length === 0) continue

      await interviewAssignmentsRepository.replaceForEvent(evt.id, candidatesForEvent)
      totalAssigned += candidatesForEvent.length
    }

    return { message: `Auto-assigned ${totalAssigned} candidates across ${events.length} events` }
  }
}
