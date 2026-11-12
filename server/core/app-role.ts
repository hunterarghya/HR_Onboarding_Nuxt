// What one process does, by APP_ROLE. The same build runs as any of them.
//   all     one process does everything (default; fine for a single server)
//   web     serves HTTP and enqueues tasks; no workers, no WhatsApp browser
//   worker  runs task workers and the WhatsApp client (HTTP is still up for health checks)
export type AppRole = 'all' | 'web' | 'worker'

export const roleDuties = (role: AppRole) => ({
  runsWorkers: role === 'all' || role === 'worker',
  runsWhatsApp: role === 'all' || role === 'worker'
})
