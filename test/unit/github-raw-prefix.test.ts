import { afterEach, expect, it, vi } from 'vitest'
import { getRawFile } from '../../layers/registry/server/utils/github-client'

afterEach(() => vi.unstubAllGlobals())

it('reads a bounded prefix and cancels the remainder of a large README', async () => {
  const cancel = vi.fn()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('Directory\n'.repeat(10_000)))
    },
    cancel,
  })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(stream)))
  expect(await getRawFile('owner', 'repo', 'a'.repeat(40), 'README.md', {}, { maxBytes: 9 }))
    .toBe('Directory')
  expect(cancel).toHaveBeenCalledOnce()
})

it('keeps complete file reads unchanged for existing callers', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Whole file')))
  expect(await getRawFile('owner', 'repo', 'a'.repeat(40), 'SKILL.md', {})).toBe('Whole file')
})
