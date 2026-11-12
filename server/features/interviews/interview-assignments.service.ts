import { NotFoundError, ValidationError } from '~~/server/core/errors/app-error'
import { withTransaction } from '~~/server/core/db/transaction'
import { candidatesRepository } from '../candidates/candidates.repository'
import { jobRolesRepository } from '../job-roles/job-roles.repository'
import { interviewAssignmentsRepository } from './interview-assignments.repository'
import { interviewEventsRepository } from './interview-events.repository'
import { OPEN_ROLE } from './interviews.dto'

const getEventOrThrow = async (id: number) => {
  const event = await interviewEventsRepository.findById(id)
  if (!event) throw new NotFoundError('Event')
  return event
}

export const interviewAssignmentsService = {
  async listForEvent(eventId: number) {
    await getEventOrThrow(eventId)
    return interviewAssignmentsRepository.listForEvent(eventId)
  },

  /** Manual assignment: the list replaces whatever the event had, all at once. */
  async replace(eventId: number, candidateIds: number[]) {
    await getEventOrThrow(eventId)
    const known = new Set(await candidatesRepository.existingIds(candidateIds))
    const unknown = candidateIds.filter(id => !known.has(id))
    if (unknown.length > 0) {
      throw new ValidationError([{ path: ['candidate_ids'], message: `No such candidates: ${unknown.join(', ')}` }], 'Unknown candidates')
    }
    await withTransaction(client => interviewAssignmentsRepository.replaceForEvent(eventId, candidateIds, client))
    return candidateIds.length
  },

  /** Candidates who could be put into this event, best score first. */
  async eligibleForEvent(eventId: number) {
    const event = await getEventOrThrow(eventId)
    return candidatesRepository.findEligibleForJob(event.job_role_id)
  },

  /** Fills the event's slots (num + extra) with the best eligible candidates not in another event of the role. */
  async autoAssign(eventId: number) {
    const evt = await getEventOrThrow(eventId)
    const totalSlots = evt.num_candidates + (evt.extra_candidates || 0)
    const excludeIds = await interviewAssignmentsRepository.candidateIdsInOtherEventsOfJob(evt.job_role_id, eventId)
    const candidateIds = await candidatesRepository.topEligibleIdsForJob(evt.job_role_id, excludeIds, totalSlots)

    if (candidateIds.length === 0) {
      return { message: 'No eligible candidates found', count: 0 }
    }

    await withTransaction(client => interviewAssignmentsRepository.replaceForEvent(eventId, candidateIds, client))
    return { message: 'Candidates auto-assigned successfully', count: candidateIds.length }
  },

  /** Spreads a role's eligible candidates over its events in date order, best scores first. */
  async autoAssignAll(role: string) {
    const isOpen = role.toLowerCase() === OPEN_ROLE.toLowerCase()
    const job = isOpen ? null : await jobRolesRepository.findByRoleName(role)
    const events = isOpen || job ? await interviewEventsRepository.findByJob(job?.id ?? null) : []
    if (events.length === 0) {
      return { message: 'No events found for this role', count: 0 }
    }

    const allCandidates = await candidatesRepository.findEligibleIdsForJob(job?.id ?? null)

    let candidateIndex = 0
    let totalAssigned = 0

    await withTransaction(async (client) => {
      for (const evt of events) {
        const totalSlots = evt.num_candidates + (evt.extra_candidates || 0)
        const candidatesForEvent: number[] = []

        while (candidatesForEvent.length < totalSlots && candidateIndex < allCandidates.length) {
          candidatesForEvent.push(allCandidates[candidateIndex]!.id)
          candidateIndex++
        }

        if (candidatesForEvent.length === 0) continue

        await interviewAssignmentsRepository.replaceForEvent(evt.id, candidatesForEvent, client)
        totalAssigned += candidatesForEvent.length
      }
    })

    return { message: `Auto-assigned ${totalAssigned} candidates across ${events.length} events` }
  }
}
