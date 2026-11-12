import { getPool, type Queryable } from '~~/server/core/db/pool'
import type { JobRoleRow } from '~~/server/database/types'

export const jobRolesRepository = {
  async findById(id: number, db: Queryable = getPool()) {
    const { rows } = await db.query<JobRoleRow>('SELECT * FROM job_roles WHERE id = $1', [id])
    return rows[0] ?? null
  }
}
