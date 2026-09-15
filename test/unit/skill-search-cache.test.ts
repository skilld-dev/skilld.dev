// @vitest-environment node
import type { EventHandler, EventHandlerRequest } from 'h3'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createApp, defineEventHandler, toWebHandler } from 'h3'
import { createStorage } from 'unstorage'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { skillSearchCacheOptions } from '../../layers/registry/server/utils/skill-search-cache'

// Exercise the installed Nitro handler, not a model of its cache behavior.
// Nitro is a Nuxt dependency, so resolve through that dependency chain.
const require = createRequire(import.meta.url)
const nuxtRequire = createRequire(require.resolve('nuxt/package.json'))
const serverRequire = createRequire(nuxtRequire.resolve('@nuxt/nitro-server/package.json'))
const runtime = join(dirname(serverRequire.resolve('nitropack/package.json')), 'dist/runtime/internal')
let storage = createStorage()
let cacheHandler: (handler: EventHandler<EventHandlerRequest, unknown>, options: typeof skillSearchCacheOptions) => EventHandler

beforeAll(async () => {
  vi.doMock(join(runtime, 'storage.mjs'), () => ({ useStorage: () => storage }))
  vi.doMock(join(runtime, 'app.mjs'), () => ({ useNitroApp: () => ({ captureError: vi.fn() }) }))
  // Dynamic loading is required to install the runtime's storage mocks first.
  cacheHandler = (await import(join(runtime, 'cache.mjs'))).defineCachedEventHandler
})

function searchServer() {
  storage = createStorage()
  let deployment: string | undefined = 'deployment-a'
  let computations = 0
  const app = createApp()
  app.use(defineEventHandler((event) => {
    Object.assign(event.context, { platform: { env: { CF_VERSION_METADATA: { id: deployment } } } })
  }))
  app.use(cacheHandler(defineEventHandler(() => ({ deployment, result: ++computations })), skillSearchCacheOptions))
  const handler = toWebHandler(app)
  return {
    deploy: (version: string | undefined) => { deployment = version },
    request: async (query: string) => {
      const response = await handler(new Request(`https://skilld.dev/api/skills${query}`))
      return response.json()
    },
  }
}

describe('search response cache identity', () => {
  it('reuses a response within a deployment and recomputes after a deployment', async () => {
    const server = searchServer()
    expect(await server.request('?q=vue')).toEqual({ deployment: 'deployment-a', result: 1 })
    expect(await server.request('?q=vue')).toEqual({ deployment: 'deployment-a', result: 1 })
    server.deploy('deployment-b')
    expect(await server.request('?q=vue')).toEqual({ deployment: 'deployment-b', result: 2 })
    expect(await server.request('?q=vue')).toEqual({ deployment: 'deployment-b', result: 2 })
  })

  it('shares cache entries when query parameter order changes', async () => {
    const server = searchServer()
    expect(await server.request('?q=vue&limit=6')).toEqual({ deployment: 'deployment-a', result: 1 })
    expect(await server.request('?limit=6&q=vue')).toEqual({ deployment: 'deployment-a', result: 1 })
  })

  it('keeps punctuation distinct after Nitro normalizes the cache key', async () => {
    const server = searchServer()
    expect(await server.request('?q=foo-bar')).toEqual({ deployment: 'deployment-a', result: 1 })
    expect(await server.request('?q=foobar')).toEqual({ deployment: 'deployment-a', result: 2 })
  })

  it('bypasses caching when the deployment binding is absent', async () => {
    const server = searchServer()
    server.deploy(undefined)
    expect(await server.request('?q=vue')).toEqual({ result: 1 })
    expect(await server.request('?q=vue')).toEqual({ result: 2 })
  })

  it('keeps search filters in the cache identity', async () => {
    const server = searchServer()
    expect(await server.request('?q=vue&owner=antfu')).toEqual({ deployment: 'deployment-a', result: 1 })
    expect(await server.request('?q=vue&owner=onmax')).toEqual({ deployment: 'deployment-a', result: 2 })
  })
})
