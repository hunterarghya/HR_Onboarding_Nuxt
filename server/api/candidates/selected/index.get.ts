export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { limit = '10', cursor, offered_role, offered_location, dateFrom, dateTo, offer_sent } = query as Record<string, string>
  const pageSize = parseInt(limit)
  const pool = usePool()

  try {
    let q = 'SELECT id, name, email, phone, offered_role, offered_salary, offered_location, joining_date, status, offer_sent FROM candidates WHERE status = $1'
    const params: any[] = ['selected']
    let paramIndex = 2

    if (offered_role) { q += ` AND offered_role = $${paramIndex++}`; params.push(offered_role) }
    if (offered_location) { q += ` AND offered_location = $${paramIndex++}`; params.push(offered_location) }
    if (dateFrom) { q += ` AND joining_date >= $${paramIndex++}`; params.push(dateFrom) }
    if (dateTo) { q += ` AND joining_date <= $${paramIndex++}`; params.push(dateTo) }
    if (offer_sent !== undefined && offer_sent !== '') { q += ` AND offer_sent = $${paramIndex++}`; params.push(offer_sent === 'true') }

    if (cursor) {
      const [cDate, cId] = (cursor as string).split('|')
      q += ` AND (joining_date > $${paramIndex} OR (joining_date = $${paramIndex} AND id > $${paramIndex + 1}))`
      params.push(cDate, cId)
      paramIndex += 2
    }

    q += ` ORDER BY joining_date ASC, id ASC LIMIT $${paramIndex}`
    params.push(pageSize + 1)

    const result = await pool.query(q, params)
    const rows = result.rows

    const hasNextPage = rows.length > pageSize
    const data = hasNextPage ? rows.slice(0, pageSize) : rows

    let nextCursor = null
    if (hasNextPage) {
      const lastItem = data[data.length - 1]
      nextCursor = `${lastItem.joining_date ? new Date(lastItem.joining_date).toISOString().split('T')[0] : ''}|${lastItem.id}`
    }

    return { data, nextCursor, hasNextPage }
  } catch (err) {
    console.error('Error fetching selected candidates:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
