import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent, getResponseHeader, setResponseHeader, setResponseHeaders } from 'h3'
import { createHooks } from 'hookable'
import { describe, expect, it, vi } from 'vitest'
import registerPlugin from '../../server/plugins/robots-header'

vi.hoisted(() => {
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
})

function setup() {
  const request = new IncomingMessage(new Socket())
  const event = createEvent(request, new ServerResponse(request))
  const hooks = createHooks<Record<string, (...args: unknown[]) => void>>()
  registerPlugin({ hooks } as unknown as Parameters<typeof registerPlugin>[0])
  return { hooks, event }
}

describe('rendered robots response header', () => {
  it('copies the page directive before a streamed response starts', async () => {
    const { hooks, event } = setup()
    await hooks.callHook('render:html', { head: ['<meta name="robots" content="noindex,follow">'] }, { event, streaming: true })
    expect(getResponseHeader(event, 'x-robots-tag')).toBe('noindex,follow')
  })

  it('copies an error page directive when the render response has no headers map', async () => {
    const { hooks, event } = setup()
    await hooks.callHook('render:response', { body: '<html><meta name="robots" content="noindex,follow"></html>' }, { event })
    expect(getResponseHeader(event, 'x-robots-tag')).toBe('noindex,follow')
  })

  it('keeps the existing header when the page has no robots directive', async () => {
    const { hooks, event } = setup()
    setResponseHeader(event, 'x-robots-tag', 'noindex')
    await hooks.callHook('render:html', { head: ['<title>Page</title>'] }, { event })
    await hooks.callHook('render:response', { body: '<html><title>Page</title></html>' }, { event })
    expect(getResponseHeader(event, 'x-robots-tag')).toBe('noindex')
  })

  it('replaces a stale response header with the rendered directive', async () => {
    const { hooks, event } = setup()
    const response = { body: '<meta name="robots" content="noindex,follow">', headers: { 'x-robots-tag': 'index,follow' } }
    await hooks.callHook('render:response', response, { event })
    setResponseHeaders(event, response.headers)
    expect(getResponseHeader(event, 'x-robots-tag')).toBe('noindex,follow')
  })
})
