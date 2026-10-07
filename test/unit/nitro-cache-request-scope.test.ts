import { defineCachedFunction } from 'nitropack/runtime/internal/cache'
import { describe, expect, it, vi } from 'vitest'

// Nitro's cache reads its storage and its error sink through virtual modules.
// The test gives it an in-memory storage and drops captured errors.
const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }))

vi.mock('nitropack/runtime/internal/storage', () => ({
  useStorage: () => ({
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: unknown) => {
      store.set(key, structuredClone(value))
    },
  }),
}))

vi.mock('nitropack/runtime/internal/app', () => ({
  useNitroApp: () => ({ captureError: () => {} }),
}))

// workerd ties I/O to the request that started it. Once that request ends,
// the answer to its I/O never arrives. A request that awaited another
// request's resolve then waited forever, and so did every later request on
// that key in the isolate, because the resolve never settled to clear itself.
describe('nitro cache resolves', () => {
  it('give a request its own value when the request whose resolve it met has ended', async () => {
    const origin = slowOrigin()
    const read = defineCachedFunction((event: RequestEvent) => origin.read(event.context.request), {
      name: 'request-scope-ended',
      maxAge: 60,
      getKey: () => 'key',
    })
    const first = workerRequest('first')
    const second = workerRequest('second')

    void read(first.event)
    await vi.waitFor(() => expect(origin.calls).toEqual(['first']))
    const value = read(second.event)
    first.end()
    origin.release()

    await expect(within(value, 1_000)).resolves.toBe('value of second')
    // The resolve that never answered holds no later request either.
    await expect(within(read(workerRequest('third').event), 1_000)).resolves.toBe('value of second')
    expect(origin.calls).toEqual(['first', 'second'])
  })

  it('share one resolve between reads inside one request', async () => {
    const origin = slowOrigin()
    const read = defineCachedFunction((event: RequestEvent) => origin.read(event.context.request), {
      name: 'request-scope-shared',
      maxAge: 60,
      getKey: () => 'key',
    })
    const only = workerRequest('only')

    const values = Promise.all([read(only.event), read(only.event)])
    await vi.waitFor(() => expect(origin.calls).toEqual(['only']))
    origin.release()

    expect(await values).toEqual(['value of only', 'value of only'])
    expect(origin.calls).toEqual(['only'])
  })
})

interface WorkerRequest {
  name: string
  ended: boolean
}

/** The part of an H3 event Nitro's cache reads. */
interface RequestEvent {
  __is_event__: true
  context: { request: WorkerRequest }
}

function workerRequest(name: string) {
  const request: WorkerRequest = { name, ended: false }
  const event: RequestEvent = { __is_event__: true, context: { request } }
  return {
    event,
    end: () => {
      request.ended = true
    },
  }
}

/**
 * An upstream that holds every answer until `release`. workerd drops the
 * answer to a request that ended before it arrived.
 */
function slowOrigin() {
  let release = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const calls: string[] = []
  return {
    calls,
    release: () => release(),
    read: async (request: WorkerRequest): Promise<string> => {
      calls.push(request.name)
      await released
      if (request.ended)
        await new Promise<never>(() => {})
      return `value of ${request.name}`
    },
  }
}

/** The promise's value, or a rejection if it takes longer than `ms`. */
async function within<A>(promise: Promise<A>, ms: number): Promise<A> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`still waiting after ${ms} ms`)), ms)
  })
  return await Promise.race([promise, limit]).finally(() => clearTimeout(timer))
}
