import { afterEach, describe, expect, it, vi } from 'vitest'
// No exports subpath reaches the app runtime plugins, so the published dist
// file itself is the artifact under test.
// eslint-disable-next-line antfu/no-import-dist, antfu/no-import-node-modules-by-path
import skewMultiTab from '../../node_modules/nuxt-skew-protection/dist/runtime/app/plugins/multi-tab.client.js'

/**
 * Sentry SKILLD-12. nuxt-skew-protection closed its multi-tab BroadcastChannel
 * on `app:error` but left the `app:manifest:update` listener attached, so a
 * later outdated-build poll posted to the closed channel and surfaced as an
 * unhandled rejection. Fixed upstream in 1.5.2; this guards the upgrade.
 */

const state = vi.hoisted(() => {
  const hooks = new Map<string, Array<(payload?: unknown) => void>>()
  const channels: Array<{ closed: boolean, posted: unknown[] }> = []
  class StubChannel {
    closed = false
    posted: unknown[] = []
    onmessage: unknown = null
    constructor() {
      channels.push(this)
    }

    postMessage(message: unknown) {
      if (this.closed)
        throw new Error('Failed to execute \'postMessage\' on \'BroadcastChannel\': Channel is closed')
      this.posted.push(message)
    }

    close() {
      this.closed = true
    }
  }
  return { hooks, channels, StubChannel }
})

// Partial mock: other Nuxt plugins in the test app graph (nuxt-use-query's
// payload plugin, for one) import their own `nuxt/app` exports, so replacing
// the whole module breaks them.
vi.mock(import('nuxt/app'), async (importOriginal) => {
  function register(name: string, handler: (payload?: unknown) => void) {
    const list = state.hooks.get(name) ?? []
    list.push(handler)
    state.hooks.set(name, list)
    return () => {
      const index = list.indexOf(handler)
      if (index >= 0)
        list.splice(index, 1)
    }
  }
  return {
    ...(await importOriginal()),
    defineNuxtPlugin: (plugin: unknown) => plugin,
    reloadNuxtApp: () => {},
    useNuxtApp: () => ({
      hook: register,
      hooks: { hook: register },
    }),
    useRuntimeConfig: () => ({ public: { skewProtection: {} } }),
  }
})

function fire(name: string, payload?: unknown) {
  for (const handler of state.hooks.get(name) ?? [])
    handler(payload)
}

afterEach(() => {
  state.hooks.clear()
  state.channels.length = 0
  vi.unstubAllGlobals()
})

describe('skew protection multi-tab channel', () => {
  it('does not post to the channel after app:error closed it', async () => {
    vi.stubGlobal('BroadcastChannel', state.StubChannel)
    await (skewMultiTab as { setup: () => void }).setup()

    const channel = state.channels.at(-1)
    expect(channel).toBeDefined()

    fire('app:error')
    expect(channel!.closed).toBe(true)

    expect(() => fire('app:manifest:update', { id: 'v2', timestamp: 1 })).not.toThrow()
    expect(channel!.posted).toHaveLength(0)
  })
})
