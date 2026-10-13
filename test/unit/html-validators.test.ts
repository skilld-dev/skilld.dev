import type { HtmlValidatorDecision, RenderedPage } from '../../shared/html-validators'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent, setResponseHeader } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import registerPlugin from '../../server/plugins/html-validators'
import { decideHtmlValidators } from '../../shared/html-validators'

vi.hoisted(() => {
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
})
vi.mock('nitropack/runtime', () => ({ useRuntimeConfig: () => ({ app: { buildId: 'build-1' } }) }))

const EDGE = 'public, max-age=300, stale-while-revalidate=3600'
const HTML = '<!DOCTYPE html><html><head><title>skill-creator</title></head><body><h1>skill-creator</h1></body></html>'

interface PageInput {
  buildId?: string
  method?: string
  status?: number
  body?: unknown
  request?: Record<string, string>
  response?: Record<string, string>
}

function page(input: PageInput = {}): RenderedPage {
  return {
    buildId: input.buildId ?? 'build-1',
    method: input.method ?? 'GET',
    status: input.status ?? 200,
    body: 'body' in input ? input.body : HTML,
    request: new Headers(input.request),
    response: new Headers({ 'content-type': 'text/html;charset=utf-8', 'cloudflare-cdn-cache-control': EDGE, ...input.response }),
  }
}

function etagOf(decision: HtmlValidatorDecision): string {
  if (decision._tag === 'skip')
    throw new Error(`Expected an ETag, got skip: ${decision.reason}`)
  return decision.etag
}

function withTrace(traceId: string): string {
  return HTML.replace('</title>', `</title><meta name="sentry-trace" content="${traceId}-9464486dcac069cf-0"/><meta name="baggage" content="sentry-environment=production,sentry-trace_id=${traceId},sentry-sampled=false">`)
}

describe('decideHtmlValidators', () => {
  it('answers a repeat request for an edge cached page with not-modified', async () => {
    const first = await decideHtmlValidators(page())
    expect(first).toEqual({ _tag: 'send', etag: expect.stringMatching(/^W\/"build-1-[0-9a-f]{32}"$/) })

    const repeat = await decideHtmlValidators(page({ request: { 'if-none-match': etagOf(first) } }))
    expect(repeat).toEqual({ _tag: 'not-modified', etag: etagOf(first) })
  })

  it.each([
    ['a list that holds it', (etag: string) => `W/"stale", ${etag}`],
    ['its strong form', (etag: string) => etag.slice(2)],
    ['a wildcard', () => '*'],
  ])('treats %s as a match', async (_label, header) => {
    const etag = etagOf(await decideHtmlValidators(page()))

    expect(await decideHtmlValidators(page({ request: { 'if-none-match': header(etag) } })))
      .toEqual({ _tag: 'not-modified', etag })
  })

  it('sends the page again when its content changed', async () => {
    const before = etagOf(await decideHtmlValidators(page()))

    const after = await decideHtmlValidators(page({ body: HTML.replace('<h1>', '<h1>Updated '), request: { 'if-none-match': before } }))

    expect(after._tag).toBe('send')
    expect(etagOf(after)).not.toBe(before)
  })

  it('sends the page again after a deploy, even when the HTML is identical', async () => {
    const before = etagOf(await decideHtmlValidators(page({ buildId: 'build-1' })))

    const after = await decideHtmlValidators(page({ buildId: 'build-2', request: { 'if-none-match': before } }))

    expect(after).toEqual({ _tag: 'send', etag: expect.stringMatching(/^W\/"build-2-/) })
  })

  it('gives two renders that differ only in their Sentry trace one ETag', async () => {
    const first = etagOf(await decideHtmlValidators(page({ body: withTrace('2edc18a9059f4c47a66214500bfcd5bc') })))
    const second = etagOf(await decideHtmlValidators(page({ body: withTrace('13c5824de8824afeb5d2ab8e2117c5e9') })))

    expect(second).toBe(first)
  })

  it.each<[string, PageInput, string]>([
    ['a request with a cookie', { request: { cookie: 'theme=dark' } }, 'credentials'],
    ['a request with an authorization header', { request: { authorization: 'Bearer token' } }, 'credentials'],
    ['a page that sets a cookie', { response: { 'set-cookie': 'nuxt-session=abc; Path=/' } }, 'sets-cookie'],
    ['a page the edge must not store', { response: { 'cloudflare-cdn-cache-control': 'private, no-store' } }, 'not-shared'],
    ['a page with no edge policy', { response: { 'cloudflare-cdn-cache-control': '' } }, 'not-shared'],
    ['a page with a zero edge lifetime', { response: { 'cloudflare-cdn-cache-control': 'public, max-age=0' } }, 'not-shared'],
    ['an error page', { status: 404 }, 'status'],
    ['a form post', { method: 'POST' }, 'method'],
    ['a JSON payload', { response: { 'content-type': 'application/json' } }, 'not-html'],
    ['a streamed body', { body: new ReadableStream() }, 'not-html'],
  ])('sends no validator for %s', async (_label, input, reason) => {
    expect(await decideHtmlValidators(page({ ...input, request: { 'if-none-match': '*', ...input.request } })))
      .toEqual({ _tag: 'skip', reason })
  })

  it('keeps validators on a page whose cookie rule only names Set-Cookie', async () => {
    const decision = await decideHtmlValidators(page({ response: { 'cloudflare-cdn-cache-control': `${EDGE}, private="set-cookie"` } }))

    expect(decision._tag).toBe('send')
  })
})

describe('html validators plugin', () => {
  interface RenderResponse { body: unknown, statusCode?: number, statusMessage?: string }
  type RenderHook = (response: RenderResponse, context: { event: ReturnType<typeof createEvent> }) => Promise<void>

  function renderHook(): RenderHook {
    let hook: RenderHook | undefined
    registerPlugin({ hooks: { hook: (name: string, callback: RenderHook) => {
      if (name === 'render:response')
        hook = callback
    } } } as unknown as Parameters<typeof registerPlugin>[0])
    if (!hook)
      throw new Error('The plugin registered no render:response hook')
    return hook
  }

  function event(headers: Record<string, string> = {}) {
    const req = new IncomingMessage(new Socket())
    req.method = 'GET'
    req.url = '/gh/anthropics/skills/skill-creator'
    req.headers = { host: 'skilld.dev', ...headers }
    const res = new ServerResponse(req)
    const h3Event = createEvent(req, res)
    setResponseHeader(h3Event, 'content-type', 'text/html;charset=utf-8')
    setResponseHeader(h3Event, 'cloudflare-cdn-cache-control', EDGE)
    return { event: h3Event, res }
  }

  it('tags the rendered page, then answers its ETag with an empty 304', async () => {
    const hook = renderHook()
    const first = event()
    const rendered: RenderResponse = { body: HTML, statusCode: 200 }
    await hook(rendered, { event: first.event })
    const etag = String(first.res.getHeader('etag'))

    expect(etag).toMatch(/^W\/"build-1-/)
    expect(rendered).toEqual({ body: HTML, statusCode: 200 })

    const repeat = event({ 'if-none-match': etag })
    const revalidated: RenderResponse = { body: HTML, statusCode: 200 }
    await hook(revalidated, { event: repeat.event })

    expect(repeat.res.getHeader('etag')).toBe(etag)
    expect(revalidated).toEqual({ body: '', statusCode: 304, statusMessage: 'Not Modified' })
    expect(repeat.res.getHeader('cloudflare-cdn-cache-control')).toBe(EDGE)
  })

  it('leaves a signed-in request without an ETag', async () => {
    const hook = renderHook()
    const signedIn = event({ 'cookie': 'nuxt-session=abc', 'if-none-match': '*' })
    const rendered: RenderResponse = { body: HTML, statusCode: 200 }
    await hook(rendered, { event: signedIn.event })

    expect(signedIn.res.getHeader('etag')).toBeUndefined()
    expect(rendered).toEqual({ body: HTML, statusCode: 200 })
  })
})
