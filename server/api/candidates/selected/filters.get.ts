export default defineEventHandler(async () => {
  const pool = usePool()
  try {
    const roles = await pool.query('SELECT DISTINCT offered_role FROM candidates WHERE status = $1 AND offered_role IS NOT NULL ORDER BY offered_role', ['selected'])
    const locations = await pool.query('SELECT DISTINCT offered_location FROM candidates WHERE status = $1 AND offered_location IS NOT NULL ORDER BY offered_location', ['selected'])
    return {
      roles: roles.rows.map((r: any) => r.offered_role),
      locations: locations.rows.map((r: any) => r.offered_location)
    }
  } catch (err) {
    console.error('Error fetching selected filters:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
