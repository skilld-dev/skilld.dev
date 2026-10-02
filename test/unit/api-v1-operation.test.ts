import type { H3Event } from 'h3'
import type { ApiV1Identity } from '../../shared/server/api-rate-limit'
import { createApp, createError, createRouter, eventHandler, toWebHandler } from 'h3'
import { defineOperation, defineResponseObject } from 'skilld-sdk/contract'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineApiOperation, operationFailure } from '../../shared/server/operation'

const resolveRequestUser = vi.hoisted(() => vi.fn())
vi.mock('../../shared/server/handler', async importOriginal => ({
  ...await importOriginal<typeof import('../../shared/server/handler')>(),
  resolveRequestUser,
}))
vi.stubGlobal('createWideEvent', (fields: unknown) => fields)
vi.stubGlobal('emitOperationalEvent', () => {})

const thing = defineResponseObject({ id: z.string(), count: z.number().int() })

const getThing = defineOperation({
  id: 'things.get',
  method: 'GET',
  path: '/api/v1/things/{id}',
  access: 'public',
  semantics: { kind: 'query' },
  cache: { _tag: 'public', maxAgeSeconds: 60, staleWhileRevalidateSeconds: 300 },
  request: {
    params: z.strictObject({ id: z.string().regex(/^[a-z]+$/) }),
    query: z.object({ count: z.coerce.number().int().min(1).max(5).default(1) }),
    body: null,
  },
  response: { status: 200, body: thing },
  errors: ['INVALID_REQUEST', 'NOT_FOUND'],
  lifecycle: { introduced: '1.0.0' },
  docs: { summary: 'Get a thing', description: 'Reads one thing.', tag: 'Things', examples: [{ request: { params: { id: 'a' } }, response: { id: 'a', count: 1 } }] },
})

const deleteThing = defineOperation({
  id: 'things.delete',
  method: 'DELETE',
  path: '/api/v1/things/{id}',
  access: 'account',
  semantics: { kind: 'mutation', retry: 'idempotent' },
  cache: { _tag: 'private' },
  request: { params: z.strictObject({ id: z.string() }), query: null, body: null },
  response: { status: 204, body: null },
  errors: ['INVALID_REQUEST', 'AUTH_REQUIRED', 'FORBIDDEN'],
  lifecycle: { introduced: '1.0.0' },
  docs: { summary: 'Delete a thing', description: 'Removes one thing.', tag: 'Things', examples: [{ request: { params: { id: 'a' } }, response: null }] },
})

function serve(handlers: { get?: (event: H3Event) => unknown, delete?: (event: H3Event) => unknown, identity?: ApiV1Identity }) {
  const app = createApp()
  app.use(eventHandler((event) => {
    event.context.platform = { requestId: 'req_test' } as never
    event.context.apiV1Identity = handlers.identity
  }))
  const router = createRouter()
  if (handlers.get)
    router.get('/api/v1/things/:id', eventHandler(handlers.get))
  if (handlers.delete)
    router.delete('/api/v1/things/:id', eventHandler(handlers.delete))
  app.use(router)
  const handle = toWebHandler(app)
  return (path: string, init?: RequestInit) => handle(new Request(`http://localhost${path}`, init))
}

describe('defineApiOperation', () => {
  beforeEach(() => resolveRequestUser.mockReset())

  it('answers the parsed body with the cache policy and request ID', async () => {
    const fetch = serve({
      get: defineApiOperation({
        operation: getThing,
        handler: ({ input }) => ({ id: input.params.id, count: input.query.count }),
      }),
    })
    const response = await fetch('/api/v1/things/abc?count=3')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 'abc', count: 3 })
    expect(response.headers.get('cache-control')).toBe('public, max-age=60, stale-while-revalidate=300')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('x-request-id')).toBe('req_test')
    expect(response.headers.get('skilld-operation')).toBe('things.get')
    expect(resolveRequestUser).not.toHaveBeenCalled()
  })

  it('answers a problem naming the field when input breaks the schema', async () => {
    const fetch = serve({ get: defineApiOperation({ operation: getThing, handler: () => ({ id: 'x', count: 1 }) }) })
    const response = await fetch('/api/v1/things/abc?count=9')
    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(await response.json()).toEqual({
      type: 'https://skilld.dev/problems/invalid-request',
      title: 'Invalid request',
      status: 400,
      detail: expect.stringContaining('query.count'),
      instance: '/api/v1/things/abc?count=9',
      code: 'INVALID_REQUEST',
    })
  })

  it('fails closed when the handler answers a field the contract does not name', async () => {
    const fetch = serve({ get: defineApiOperation({ operation: getThing, handler: () => ({ id: 'a', count: 1, secret: 'x' }) as never }) })
    const response = await fetch('/api/v1/things/abc')
    expect(response.status).toBe(500)
    const problem = await response.json()
    expect(problem.code).toBe('INTERNAL_ERROR')
    expect(problem).not.toHaveProperty('detail')
  })

  it('answers a declared failure value as its problem', async () => {
    const fetch = serve({ get: defineApiOperation({ operation: getThing, handler: () => operationFailure('NOT_FOUND', 'No thing named abc.') }) })
    const response = await fetch('/api/v1/things/abc')
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND', detail: 'No thing named abc.' })
  })

  it('maps a thrown h3 client error onto its contract code', async () => {
    const fetch = serve({
      get: defineApiOperation({
        operation: getThing,
        handler: () => {
          throw createError({ statusCode: 404, message: 'Skill not found' })
        },
      }),
    })
    const response = await fetch('/api/v1/things/abc')
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND', detail: 'Skill not found' })
  })

  it('hides the message of an unexpected server error', async () => {
    const fetch = serve({
      get: defineApiOperation({
        operation: getThing,
        handler: () => {
          throw new Error('D1_ERROR: database is locked')
        },
      }),
    })
    const response = await fetch('/api/v1/things/abc')
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('D1_ERROR')
  })

  it('answers AUTH_REQUIRED for an account operation without a user', async () => {
    resolveRequestUser.mockResolvedValue(null)
    const handler = vi.fn()
    const fetch = serve({ delete: defineApiOperation({ operation: deleteThing, handler }) })
    const response = await fetch('/api/v1/things/abc', { method: 'DELETE' })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'AUTH_REQUIRED' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('answers 204 with no body for a signed-in delete', async () => {
    resolveRequestUser.mockResolvedValue({ id: 7, login: 'octo' })
    const handler = vi.fn(() => null)
    const fetch = serve({ delete: defineApiOperation({ operation: deleteThing, handler }) })
    const response = await fetch('/api/v1/things/abc', { method: 'DELETE' })
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ user: { id: 7, login: 'octo' } }))
  })

  it('reuses the account verified by rate-limit middleware', async () => {
    const handler = vi.fn(() => null)
    const fetch = serve({
      identity: { _tag: 'account', user: { id: 7, login: 'octo' } },
      delete: defineApiOperation({ operation: deleteThing, handler }),
    })
    expect((await fetch('/api/v1/things/abc', { method: 'DELETE' })).status).toBe(204)
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ user: { id: 7, login: 'octo' } }))
    expect(resolveRequestUser).not.toHaveBeenCalled()
  })

  it('refuses an account operation when middleware resolved a guest', async () => {
    const handler = vi.fn()
    const fetch = serve({ identity: { _tag: 'guest' }, delete: defineApiOperation({ operation: deleteThing, handler }) })
    expect((await fetch('/api/v1/things/abc', { method: 'DELETE' })).status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
    expect(resolveRequestUser).not.toHaveBeenCalled()
  })

  it('turns an undeclared failure code into INTERNAL_ERROR', async () => {
    resolveRequestUser.mockResolvedValue({ id: 7, login: 'octo' })
    const fetch = serve({ delete: defineApiOperation({ operation: deleteThing, handler: () => operationFailure('CONFLICT' as 'FORBIDDEN') }) })
    const response = await fetch('/api/v1/things/abc', { method: 'DELETE' })
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ code: 'INTERNAL_ERROR' })
  })
})
