/**
 * POST /api/collections/import
 * Accepts a list of skill package names from the CLI, stores them temporarily
 * with a short-lived token. The user can then paste this token in the UI to import.
 *
 * Body: { skills: string[] }
 * Returns: { token: string, expires: string }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body?.skills || !Array.isArray(body.skills) || !body.skills.length)
    throw createError({ statusCode: 400, message: 'skills must be a non-empty array of package names' })

  const skills = body.skills
    .filter((s: unknown): s is string => typeof s === 'string' && s.length > 0)
    .slice(0, 100) // cap at 100

  if (!skills.length)
    throw createError({ statusCode: 400, message: 'No valid skill names provided' })

  const token = crypto.randomUUID().replaceAll('-', '').slice(0, 16)
  const expires = Date.now() + 15 * 60 * 1000 // 15 minutes

  await useStorage('data').setItem(`import:${token}`, { skills, expires }, { ttl: 900 })

  return { token, expires: new Date(expires).toISOString() }
})
