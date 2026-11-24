import type { BackgroundWideEvent } from '@harlan-zw/nuxt-wide-events/standalone'
import { beforeEach, vi } from 'vitest'
import { emitOperationalEvent } from '../server/utils/operational-event'

beforeEach(() => {
  vi.stubGlobal('createWideEvent', (): BackgroundWideEvent => ({
    context: {},
    setLevel: vi.fn(),
    emit: vi.fn(() => null),
  }))
  vi.stubGlobal('emitOperationalEvent', emitOperationalEvent)
})

vi.mock('#shared/server/fetch', () => {
  const fetch = new Proxy((() => {}) as typeof $fetch, {
    apply(_target, thisArg, args) {
      return Reflect.apply(globalThis.$fetch, thisArg, args)
    },
    get(_target, key) {
      return Reflect.get(globalThis.$fetch, key)
    },
  })
  return { $fetch: fetch }
})
