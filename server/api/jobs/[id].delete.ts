export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const pool = usePool()

  try {
    await pool.query('DELETE FROM job_roles WHERE id = $1', [id])

    // Remove from Qdrant
    await removeJobDescription(parseInt(id!))

    return { message: 'Job role deleted successfully' }
  } catch (err) {
    console.error('Error deleting job role:', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
