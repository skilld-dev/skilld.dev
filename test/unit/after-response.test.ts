import { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { resolveAfterResponse, runAfterResponse } from '../../shared/server/after-response'

describe('after-response waitUntil resolution', () => {
  it('registers work through Nitro 3 req.waitUntil', async () => {
    const tracked: Promise<unknown>[] = []
    const request = new Request('https://skilld.dev/api/v1/resolutions')
    ;(request as Request & { waitUntil?: (promise: Promise<unknown>) => void }).waitUntil = promise => tracked.push(promise)
    const event = new H3Event(request)
    const work = Promise.resolve('done')

    expect(runAfterResponse(event, work)).toBe(true)
    expect(tracked).toEqual([work])
  })

  it('falls back to event.runtime.cloudflare.context.waitUntil with bound receiver', async () => {
    const tracked: Promise<unknown>[] = []
    const executionContext = {
      tracked,
      waitUntil(this: { tracked: Promise<unknown>[] }, promise: Promise<unknown>) {
        this.tracked.push(promise)
      },
    }
    const request = new Request('https://skilld.dev/api/v1/resolutions')
    ;(request as Request & { runtime?: object }).runtime = {
      name: 'cloudflare',
      cloudflare: { context: executionContext },
    }
    const event = new H3Event(request)
    const work = Promise.resolve('done')

    expect(runAfterResponse(event, work)).toBe(true)
    expect(tracked).toEqual([work])
  })

  it('returns null and false when no Nitro 3 waitUntil exists, ignoring dead Nitro 2 event.context.cloudflare', () => {
    const legacyTracked: Promise<unknown>[] = []
    const event = new H3Event(new Request('https://skilld.dev/api/v1/resolutions'))
    ;(event.context as { cloudflare?: object }).cloudflare = {
      context: { waitUntil: (promise: Promise<unknown>) => legacyTracked.push(promise) },
    }

    expect(resolveAfterResponse(event)).toBeNull()
    expect(runAfterResponse(event, Promise.resolve('done'))).toBe(false)
    expect(legacyTracked).toEqual([])
  })
})
