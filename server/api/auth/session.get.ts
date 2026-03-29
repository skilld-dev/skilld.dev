export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.sessionPassword)
    return null

  const session = await useSession(event, { password: config.sessionPassword as string })
  return session.data?.public ?? null
})
