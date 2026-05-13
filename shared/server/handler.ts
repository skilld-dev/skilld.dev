import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import type { z } from 'zod'
import type { Platform } from './platform'

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
  P = R,
>(opts: ApiHandlerOptions<S, R, P>): EventHandler<EventHandlerRequest, Promise<P>> {
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
      const raw = isMethodWithBody(event) ? await readBody(event).catch(() => ({})) : getQuery(event)
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

    const session = await getUserSession(event).catch(() => null) as UserSession | null
    const bearerUser = session?.user ? null : await resolveBearerUser(event)
    const user = session?.user ?? bearerUser

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
    return (opts.presenter ? opts.presenter(result, ctx) : (result as unknown as P))
  })
}

async function resolveBearerUser(event: H3Event): Promise<UserSession['user'] | null> {
  const { resolveBearerSession } = await import('~~/layers/identity/server/utils/bearer')
  return await resolveBearerSession(event)
}

function isMethodWithBody(event: H3Event): boolean {
  const m = event.method
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE'
}
