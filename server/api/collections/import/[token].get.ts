/**
 * GET /api/collections/import/:token
 * Retrieves and consumes an import token, returning the skill list.
 * Token is single-use: deleted after retrieval.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token || token.length !== 16)
    throw createError({ statusCode: 400, message: 'Invalid token' })

  const data = await useStorage('data').getItem<{ skills: string[], expires: number }>(`import:${token}`)

  if (!data)
    throw createError({ statusCode: 404, message: 'Token not found or expired' })

  if (Date.now() > data.expires) {
    await useStorage('data').removeItem(`import:${token}`)
    throw createError({ statusCode: 410, message: 'Token has expired' })
  }

  // Single-use: consume the token
  await useStorage('data').removeItem(`import:${token}`)

  return { skills: data.skills }
})
