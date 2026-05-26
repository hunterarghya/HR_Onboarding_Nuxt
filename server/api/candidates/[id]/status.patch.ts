export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const { status, offered_role, offered_salary, offered_location, joining_date } = body
  const pool = usePool()

  try {
    if (status === 'selected') {
      if (!offered_role || !offered_salary || !offered_location || !joining_date) {
        throw createError({ statusCode: 400, statusMessage: 'All offer fields (offered_role, offered_salary, offered_location, joining_date) are required for "selected" status.' })
      }
      await pool.query(
        'UPDATE candidates SET status = $1, offered_role = $2, offered_salary = $3, offered_location = $4, joining_date = $5 WHERE id = $6',
        [status, offered_role, offered_salary, offered_location, joining_date, id]
      )
    } else {
      await pool.query('UPDATE candidates SET status = $1 WHERE id = $2', [status, id])
    }
    return { message: 'Status updated successfully' }
  } catch (err: any) {
    if (err.statusCode) throw err
    console.error('Error updating status:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
