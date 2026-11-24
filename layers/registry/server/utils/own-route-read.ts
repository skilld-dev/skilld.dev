import type { H3Event } from 'h3'
import { createError, serverFetch } from 'nuxt/server'
import { authSessionEvent } from '#shared/server/session-access'

export type OwnRouteRead<T>
  = | { _tag: 'found', value: T }
    | { _tag: 'missing' }

function statusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null)
    return null
  const record = error as { statusCode?: unknown, status?: unknown }
  if (typeof record.statusCode === 'number')
    return record.statusCode
  return typeof record.status === 'number' ? record.status : null
}

export async function fetchOwnRoute<T>(event: H3Event, path: `/${string}`): Promise<T> {
  const response = await serverFetch(authSessionEvent(event), path)
  if (!response.ok)
    throw createError({ status: response.status, statusText: response.statusText })
  return response.json() as Promise<T>
}

/**
 * Read one of the site's own routes in process.
 *
 * A `/api/v1` answer built this way shares the route's cache and its D1
 * budget, and it cannot drift from what the site page shows. A 404 is an
 * expected answer, so it comes back as a value. Every other failure
 * propagates, and the operation adapter maps it to a problem.
 */
export function readOwnRoute<T>(event: H3Event, path: `/${string}`): Promise<OwnRouteRead<T>> {
  return fetchOwnRoute<T>(event, path).then(
    (value): OwnRouteRead<T> => ({ _tag: 'found', value }),
    (error: unknown): OwnRouteRead<T> => {
      if (statusOf(error) === 404)
        return { _tag: 'missing' }
      throw error
    },
  )
}
