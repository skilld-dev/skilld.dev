export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.sessionPassword)
    return null

  const session = await getUserSession(event)
  return session.data?.public ?? null
})
