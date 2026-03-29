export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.sessionPassword)
    return 'No session'

  const session = await useSession(event, { password: config.sessionPassword as string })
  await session.clear()
  return 'Session cleared'
})
