import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../../server/database/migrator'
import { ROOT } from '../helpers/routes'
import { assignCandidate, db, insertCandidate, insertEvent, insertForm, insertJob } from './helpers/db'

const DIR = join(ROOT, 'server/database/migrations')
const migrationFiles = () => readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
  .map(name => ({ name, sql: readFileSync(join(DIR, name), 'utf8') }))

// The server under test migrated this database at boot; these tests check the result and the rules.
describe('database migrations', () => {
  it('recorded every migration file at boot', async () => {
    const { rows } = await db().query('SELECT name FROM schema_migrations ORDER BY name')
    expect(rows.map(r => r.name)).toEqual(migrationFiles().map(m => m.name))
  })

  it('applies nothing when run again', async () => {
    await expect(runMigrations(db(), migrationFiles())).resolves.toEqual([])
  })

  it('can re-run the baseline over an existing schema (adopts databases made by the old boot code)', async () => {
    await expect(db().query(migrationFiles()[0]!.sql)).resolves.toBeDefined()
  })

  it('rolls a failing migration back and does not record it', async () => {
    const broken = { name: '9999_broken.sql', sql: 'CREATE TABLE migration_probe (id int); SELECT * FROM no_such_table;' }
    await expect(runMigrations(db(), [...migrationFiles(), broken])).rejects.toThrow(/9999_broken\.sql failed/)

    const recorded = await db().query('SELECT 1 FROM schema_migrations WHERE name = $1', [broken.name])
    const probe = await db().query(`SELECT to_regclass('migration_probe') AS t`)
    expect(recorded.rowCount).toBe(0)
    expect(probe.rows[0].t).toBeNull()
  })
})

describe('database rules', () => {
  it('refuses values outside the fixed lists', async () => {
    const c = await insertCandidate()
    const e = await insertEvent()
    await expect(db().query(`UPDATE candidates SET applied_through = 'Fax' WHERE id = $1`, [c.id]))
      .rejects.toThrow(/candidates_applied_through_check/)
    await expect(db().query(`UPDATE interview_events SET interview_mode = 'hybrid' WHERE id = $1`, [e.id]))
      .rejects.toThrow(/interview_events_interview_mode_check/)
    await expect(db().query(`UPDATE email_templates SET type = 'birthday' WHERE id = (SELECT min(id) FROM email_templates)`))
      .rejects.toThrow(/email_templates_type_check/)
  })

  it('allows one copy of a Google Calendar event (BUG-09)', async () => {
    await insertEvent({ google_event_id: 'g-unique-1' })
    await expect(insertEvent({ google_event_id: 'g-unique-1' })).rejects.toThrow(/interview_events_google_event_id_unique/)
    await insertEvent({ google_event_id: null })
    await insertEvent({ google_event_id: null }) // events made in the app have none, and there can be many
  })

  it('allows one form per job (BUG-13)', async () => {
    const job = await insertJob()
    await insertForm({ job_role_id: job.id })
    await expect(insertForm({ job_role_id: job.id })).rejects.toThrow(/google_forms_job_role_unique/)
  })

  it('removes a deleted candidate\'s interview places with it', async () => {
    const c = await insertCandidate()
    const e = await insertEvent()
    await assignCandidate(e.id, c.id)
    await db().query('DELETE FROM candidates WHERE id = $1', [c.id])
    const { rowCount } = await db().query('SELECT 1 FROM interview_candidates WHERE candidate_id = $1', [c.id])
    expect(rowCount).toBe(0)
  })

  it('stores every timestamp with its time zone', async () => {
    const { rows } = await db().query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'`)
    expect(rows).toEqual([])
  })
})
