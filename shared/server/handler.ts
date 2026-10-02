import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import type { z } from 'zod'
import type { Platform } from './platform'
import { getHeader } from 'h3'
import { readUserSession } from './session-access'

export const MAX_API_BODY_BYTES = 1024 * 1024

export interface UserSession {
  user: { id: number, login: string, [key: string]: unknown }
  [key: string]: unknown
}

export interface HandlerCtx<B> {
  event: H3Event
  body: B
  platform: Platform
  user: UserSession['user'] | null
  session: UserSession | null
}

export type Policy<B = unknown> = (ctx: HandlerCtx<B>) => boolean | Promise<boolean>

export interface ApiHandlerOptions<S extends z.ZodTypeAny, R, P> {
  schema?: S
  /**
   * Protocol response schema. Dev/test: strict parse, so drift is a 500 we
   * see in CI. Prod: soft parse + log, never block a response on a schema
   * mismatch the CLI can already tolerate.
   */
  response?: z.ZodTypeAny
  policy?: Policy<z.infer<S>> | Policy<z.infer<S>>[]
  handler: (ctx: HandlerCtx<z.infer<S>>) => Promise<R> | R
  presenter?: (row: R, ctx: HandlerCtx<z.infer<S>>) => P
  requireAuth?: boolean
}

/**
 * Single Nitro handler shape. Pipeline: parse body → zod validate → load
 * session → run policies (AND) → call handler → presenter → return.
 *
 * The handler reads infrastructure from `ctx.platform`, never from
 * `event.context.cloudflare.env`.
 */
export function defineApiHandler<
  S extends z.ZodTypeAny = z.ZodAny,
  R = unknown,
>(opts: ApiHandlerOptions<S, R, R> & { presenter?: undefined }): EventHandler<EventHandlerRequest, Promise<R>>
export function defineApiHandler<
  S extends z.ZodTypeAny = z.ZodAny,
  R = unknown,
  P = R,
>(opts: ApiHandlerOptions<S, R, P> & { presenter: NonNullable<ApiHandlerOptions<S, R, P>['presenter']> }): EventHandler<EventHandlerRequest, Promise<P>>
export function defineApiHandler<
  S extends z.ZodTypeAny,
  R,
  P,
>(opts: ApiHandlerOptions<S, R, P>): EventHandler<EventHandlerRequest, Promise<R | P>> {
  return defineEventHandler(async (event) => {
    const platform = event.context.platform
    if (!platform) {
      throw createError({
        statusCode: 500,
        message: 'platform context missing — server/plugins/platform.ts not loaded',
      })
    }

    let body = undefined as z.infer<S>
    if (opts.schema) {
      const raw = isMethodWithBody(event) ? await readApiBody(event) : getQuery(event)
      const parsed = opts.schema.safeParse(raw)
      if (!parsed.success) {
        throw createError({
          statusCode: 400,
          message: 'Validation failed',
          data: { issues: parsed.error.issues },
        })
      }
      body = parsed.data as z.infer<S>
    }

    const session = await readSession(event)
    const user = session?.user ?? await resolveBearerUser(event)

    if (opts.requireAuth && !user) {
      throw createError({ statusCode: 401, message: 'Not signed in' })
    }

    const ctx: HandlerCtx<z.infer<S>> = { event, body, platform, user, session }

    const policies = Array.isArray(opts.policy) ? opts.policy : opts.policy ? [opts.policy] : []
    for (const policy of policies) {
      if (!(await policy(ctx))) {
        throw createError({ statusCode: 403, message: 'Forbidden' })
      }
    }

    const result = await opts.handler(ctx)
    const presented = opts.presenter ? opts.presenter(result, ctx) : result

    if (opts.response) {
      const parsed = opts.response.safeParse(presented)
      if (!parsed.success) {
        if (import.meta.dev || import.meta.test) {
          throw createError({
            statusCode: 500,
            message: 'Response failed protocol validation',
            data: { issues: parsed.error.issues },
          })
        }
        emitOperationalEvent(createWideEvent({ operation: 'api-response-validation', outcome: 'failed' }))
      }
    }
    return presented
  })
}

async function readSession(event: H3Event): Promise<UserSession | null> {
  return await readUserSession(event).catch(() => {
    emitOperationalEvent(createWideEvent({ operation: 'api-session', outcome: 'failed' }))
    return null
  })
}

/** The signed-in user: the skilld.dev session cookie first, then a skilld token sent as a Bearer credential. */
export async function resolveRequestUser(event: H3Event): Promise<UserSession['user'] | null> {
  const session = await readSession(event)
  return session?.user ?? await resolveBearerUser(event)
}

async function resolveBearerUser(event: H3Event): Promise<UserSession['user'] | null> {
  const { resolveBearerSession } = await import('#layers/identity/server/utils/bearer')
  return await resolveBearerSession(event)
}

function isMethodWithBody(event: H3Event): boolean {
  const m = event.method
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE'
}

export async function readApiBody(event: H3Event): Promise<unknown> {
  const contentLength = Number(getHeader(event, 'content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_API_BODY_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Payload Too Large',
      message: `Request body exceeds the ${MAX_API_BODY_BYTES}-byte limit`,
    })
  }
  return await readBody(event)
}
