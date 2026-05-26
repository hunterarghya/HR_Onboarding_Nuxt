export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { limit = '10', cursor, role, status, source, name, minScore, maxScore, scoreSort } = query as Record<string, string>
  const pageSize = parseInt(limit)
  const pool = usePool()

  try {
    let q = 'SELECT * FROM candidates WHERE 1=1'
    const params: any[] = []
    let paramIndex = 1

    if (role) { q += ` AND role_applied = $${paramIndex++}`; params.push(role) }
    if (status) { q += ` AND status = $${paramIndex++}`; params.push(status) }
    if (source) { q += ` AND applied_through = $${paramIndex++}`; params.push(source) }
    if (name) { q += ` AND name ILIKE $${paramIndex++}`; params.push(`%${name}%`) }
    if (minScore !== undefined && minScore !== '') { q += ` AND score >= $${paramIndex++}`; params.push(parseInt(minScore)) }
    if (maxScore !== undefined && maxScore !== '') { q += ` AND score <= $${paramIndex++}`; params.push(parseInt(maxScore)) }

    if (cursor) {
      const [cScore, cTime, cId] = (cursor as string).split('|')
      const scoreVal = parseInt(cScore!)

      if (scoreSort === 'highToLow') {
        q += ` AND (score < $${paramIndex} OR (score = $${paramIndex} AND (date_applied < $${paramIndex + 1} OR (date_applied = $${paramIndex + 1} AND id < $${paramIndex + 2}))))`
        params.push(scoreVal, cTime, cId)
        paramIndex += 3
      } else if (scoreSort === 'lowToHigh') {
        q += ` AND (score > $${paramIndex} OR (score = $${paramIndex} AND (date_applied < $${paramIndex + 1} OR (date_applied = $${paramIndex + 1} AND id < $${paramIndex + 2}))))`
        params.push(scoreVal, cTime, cId)
        paramIndex += 3
      } else {
        q += ` AND (date_applied < $${paramIndex} OR (date_applied = $${paramIndex} AND id < $${paramIndex + 1}))`
        params.push(cTime, cId)
        paramIndex += 2
      }
    }

    let orderBy = 'ORDER BY date_applied DESC, id DESC'
    if (scoreSort === 'highToLow') orderBy = 'ORDER BY score DESC, date_applied DESC, id DESC'
    else if (scoreSort === 'lowToHigh') orderBy = 'ORDER BY score ASC, date_applied DESC, id DESC'

    q += ` ${orderBy} LIMIT $${paramIndex}`
    params.push(pageSize + 1)

    const result = await pool.query(q, params)
    const rows = result.rows

    const hasNextPage = rows.length > pageSize
    const data = hasNextPage ? rows.slice(0, pageSize) : rows

    let nextCursor = null
    if (hasNextPage) {
      const lastItem = data[data.length - 1]
      nextCursor = `${lastItem.score}|${lastItem.date_applied.toISOString()}|${lastItem.id}`
    }

    return { data, nextCursor, hasNextPage }
  } catch (err) {
    console.error('Error fetching candidates:', err)
    throw createError({ statusCode: 500, statusMessage: 'Error fetching candidates' })
  }
})
