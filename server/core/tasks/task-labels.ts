import type { QueueName, TaskName, TaskPayloads } from './queues'

// What the Tasks page shows instead of internal names like "calendar.renewChannels". Keyed by
// TaskName, so a new task doesn't compile until it has a title and a summary here.

export const QUEUE_TITLES: Record<QueueName, string> = {
  scans: 'Resume scans',
  mail: 'Emails',
  background: 'Calendar and job matching'
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Fields the tasks' results may carry; a missing count reads as 0 */
type Result = Partial<Record<'count' | 'sent' | 'failed' | 'imported' | 'deleted' | 'renewed' | 'indexed', number>> & {
  message?: string
  role?: string
  /** a count of emails skipped, or why an indexing task was skipped */
  skipped?: number | string
}

const roleOf = (data: unknown) => {
  const role = (data as { role?: unknown } | null)?.role
  return typeof role === 'string' && role ? `“${role}”` : 'a job'
}

const scanSummary = (r: Result) => {
  if (r.count) return `${plural(r.count, 'new candidate')} found`
  // "Email scan complete" with nothing new, or why nothing was scanned ("No Google Forms configured")
  return r.message && !/complete$/i.test(r.message) ? r.message : 'No new candidates found'
}

const mailSummary = (r: Result) =>
  [`${plural(r.sent ?? 0, 'email')} sent`, r.failed && `${r.failed} failed`, r.skipped && `${r.skipped} skipped (already sent)`]
    .filter(Boolean).join(' · ')

const LABELS: { [K in TaskName]: { title: (data: TaskPayloads[K]) => string, summary: (result: Result) => string } } = {
  'scan.gmail': { title: () => 'Scan Gmail for resumes', summary: scanSummary },
  'scan.forms': { title: () => 'Scan Google Forms responses', summary: scanSummary },
  'scan.whatsapp': { title: () => 'Scan WhatsApp groups for resumes', summary: scanSummary },
  'calendar.sync': {
    title: () => 'Sync Google Calendar',
    summary: r => r.message && r.imported === undefined
      ? r.message
      : `${plural(r.imported ?? 0, 'event')} imported${r.deleted ? `, ${r.deleted} removed` : ''}`
  },
  'calendar.renewChannels': {
    title: () => 'Keep Google Calendar updates coming',
    summary: r => (r.renewed || r.failed
      ? `${plural(r.renewed ?? 0, 'calendar')} renewed${r.failed ? `, ${r.failed} failed` : ''}`
      : 'Nothing needed renewing')
  },
  'mail.invites': { title: () => 'Send interview invitations', summary: mailSummary },
  'mail.invitesAll': { title: () => 'Send all interview invitations', summary: mailSummary },
  'mail.offers': { title: () => 'Send offer letters', summary: mailSummary },
  'vectors.syncJob': {
    title: data => `Prepare ${roleOf(data)} for resume matching`,
    summary: r => (typeof r.skipped === 'string' ? 'Skipped: the job was deleted' : `${r.role ? `“${r.role}”` : 'The job'} is ready to match resumes`)
  },
  'vectors.removeJob': {
    title: data => `Remove ${roleOf(data)} from resume matching`,
    summary: () => 'Removed'
  },
  'vectors.resyncAll': {
    title: () => 'Prepare all jobs for resume matching',
    summary: r => (r.indexed ? `${plural(r.indexed, 'job')} ready to match resumes` : 'No jobs to prepare yet')
  }
}

const labelsFor = (name: string) => LABELS[name as TaskName] as { title: (data: unknown) => string, summary: (result: Result) => string } | undefined

/** "Sync Google Calendar"; a task this build doesn't know keeps its internal name */
export const taskTitle = (name: string, data: unknown): string => labelsFor(name)?.title(data) ?? name

/** One plain sentence about a finished task's result ("3 new candidates found"); '' if there's nothing to say */
export const taskSummary = (name: string, result: unknown): string => {
  if (!result || typeof result !== 'object') return ''
  return labelsFor(name)?.summary(result as Result) ?? ''
}
