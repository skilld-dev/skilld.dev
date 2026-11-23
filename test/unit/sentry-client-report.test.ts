import type { Event } from '@sentry/nuxt'
import { createError } from 'h3'
import { describe, expect, it } from 'vitest'
import { filterClientReport } from '../../shared/sentry'

function report(type: string, value: string): Event {
  return { exception: { values: [{ type, value }] } }
}

function namedError(name: string, message: string): Error {
  return Object.assign(new Error(message), { name })
}

describe('filterClientReport', () => {
  it.each([
    { issue: 'SKILLD-5B', thrown: 'ResizeObserver loop limit exceeded', event: report('Error', 'ResizeObserver loop limit exceeded') },
    { issue: 'SKILLD-4Q', thrown: new DOMException('AsyncData request cancelled by deduplication', 'AbortError'), event: report('AbortError', 'AsyncData request cancelled by deduplication') },
    { issue: 'SKILLD-4W', thrown: new Error('AbortError: AsyncData request cancelled by deduplication'), event: report('Error', 'AbortError: AsyncData request cancelled by deduplication') },
    { issue: 'SKILLD-4T', thrown: namedError('FetchError', '[GET] "/api/feed/trending?limit=30": <no response> AsyncData request cancelled by unmount'), event: report('FetchError', '[GET] "/api/feed/trending?limit=30": <no response> AsyncData request cancelled by unmount') },
    { issue: 'SKILLD-59', thrown: new DOMException('signal is aborted without reason', 'AbortError'), event: report('AbortError', 'signal is aborted without reason') },
    { issue: 'SKILLD-4Y', thrown: namedError('FetchError', '[GET] "/_nuxt/v2/builds/meta/f992d060-9682-4700-9b5e-fb06ae8e7456.json": 404 Not Found'), event: report('FetchError', '[GET] "/_nuxt/v2/builds/meta/f992d060-9682-4700-9b5e-fb06ae8e7456.json": 404 Not Found') },
  ])('drops the $issue report that names no site defect', ({ thrown, event }) => {
    expect(filterClientReport(event, { originalException: thrown })).toBeNull()
    expect(filterClientReport(structuredClone(event), {})).toBeNull()
  })

  it.each([
    { issue: 'SKILLD-4P', event: report('TypeError', 'e.toSorted is not a function') },
    { issue: 'SKILLD-4N', event: report('TypeError', 'Failed to fetch') },
    { issue: 'server error', event: report('FetchError', '[GET] "/api/skills": 500 Internal Server Error') },
    { issue: 'current build', event: report('FetchError', '[GET] "/_nuxt/v2/builds/latest.json": 404 Not Found') },
  ])('keeps the $issue report', ({ event }) => {
    expect(filterClientReport(event, {})).toBe(event)
  })

  // Nuxt's `createErrorFromThrown` hands the thrown value to h3's `createError`, as here.
  it('names what a messageless error was thrown with, and never its content (SKILLD-54)', () => {
    const loadFailure = new globalThis.Event('error')
    Object.defineProperty(loadFailure, 'target', { value: { tagName: 'SCRIPT', src: 'https://skilld.dev/_nuxt/v2/BzUDwpzU.js' } })
    const fromEvent = filterClientReport(report('Error', ''), { originalException: createError(loadFailure as never) })
    expect(fromEvent?.tags).toEqual({ 'thrown.cause': 'Event:error:SCRIPT' })

    const fromObject = filterClientReport(report('Error', ''), { originalException: createError({ secret: 'value' } as never) })
    expect(fromObject?.tags).toEqual({ 'thrown.cause': 'Object' })
  })

  it('leaves the tags alone when the error carries its own message', () => {
    const event = report('Error', 'Skill not found')
    expect(filterClientReport(event, { originalException: new Error('Skill not found', { cause: new globalThis.Event('error') }) })?.tags).toBeUndefined()
  })
})
