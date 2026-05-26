export default defineEventHandler(async () => {
  try {
    const groups = await getGroups()
    return groups
  } catch (err) {
    console.error('Error fetching groups:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch groups' })
  }
})
