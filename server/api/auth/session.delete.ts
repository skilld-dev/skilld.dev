export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.sessionPassword)
    return 'No session'

  const session = await getUserSession(event)
  await session.clear()
  return 'Session cleared'
})
