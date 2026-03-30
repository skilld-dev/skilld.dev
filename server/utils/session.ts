import type { H3Event } from 'h3'

const SESSION_MAX_AGE = 60 * 60 * 24 * 179 // 179 days, matches OAuth session TTL

export function getUserSession(event: H3Event) {
  const config = useRuntimeConfig(event)
  return useSession(event, {
    password: config.sessionPassword as string,
    maxAge: SESSION_MAX_AGE,
  })
}
