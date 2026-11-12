import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../../server/database/migrator'
import { ROOT } from '../helpers/routes'
import { db } from './helpers/db'

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
