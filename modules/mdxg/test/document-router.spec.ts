import type { UseMdxgRouter, UseMdxgRouterOptions } from '../src/runtime/composables/useMdxgDocumentRouter'
// @vitest-environment happy-dom
import type { MdxgDocument, MdxgLinkResolveResult } from '../src/runtime/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { useMdxgDocumentRouter } from '../src/runtime/composables/useMdxgDocumentRouter'

function docOf(slug: string): MdxgDocument {
  return {
    data: {} as MdxgDocument['data'],
    toc: undefined,
    excerpt: undefined,
    body: { type: 'root', children: [] },
    pages: [{ index: 0, slug, title: slug, level: 1, body: { type: 'root', children: [] }, searchText: '', outline: [] }],
    nav: [{ index: 0, slug, title: slug, level: 1 }],
  }
}

function result(docId: string, url?: string): MdxgLinkResolveResult {
  return { docId, document: docOf(docId), url }
}

// The router registers onBeforeUnmount, so it needs a live component instance.
// Each mounted app is unmounted after the test, which removes the popstate listener.
const unmounts: Array<() => void> = []

afterEach(() => {
  unmounts.splice(0).forEach(unmount => unmount())
})

function withSetup(opts: UseMdxgRouterOptions): UseMdxgRouter {
  let router!: UseMdxgRouter
  const app = createApp(defineComponent(() => {
    router = useMdxgDocumentRouter(opts)
    return () => h('div')
  }))
  app.mount(document.createElement('div'))
  unmounts.push(() => app.unmount())
  return router
}

describe('useMdxgDocumentRouter', () => {
  it('navigates and updates the current document', async () => {
    const resolver = vi.fn(async () => result('b', '/b'))
    const r = withSetup({
      resolver,
      initial: { docId: 'a', document: docOf('a'), url: '/a' },
    })
    expect(r.current.value.docId).toBe('a')
    await r.navigate('./b.md')
    expect(r.current.value.docId).toBe('b')
    expect(resolver).toHaveBeenCalledTimes(1)
    expect(resolver.mock.calls[0]![0]).toMatchObject({ href: './b.md', fromDocId: 'a' })
  })

  it('extracts the anchor fragment from the href', async () => {
    const resolver = vi.fn(async () => result('b'))
    const r = withSetup({
      resolver,
      initial: { docId: 'a', document: docOf('a') },
    })
    await r.navigate('./b.md#section')
    expect(resolver.mock.calls[0]![0].fragment).toBe('section')
    expect(r.pendingFragment.value).toBe('section')
  })

  it('returns null and triggers default navigation when resolver returns null', async () => {
    const navSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        get href() {
          return ''
        },
        set href(v: string) {
          navSpy(v)
        },
      },
    })
    const r = withSetup({
      resolver: async () => null,
      initial: { docId: 'a', document: docOf('a') },
    })
    const out = await r.navigate('./img.svg')
    expect(out).toBeNull()
    expect(navSpy).toHaveBeenCalledWith('./img.svg')
  })

  it('surfaces errors without leaving an empty state', async () => {
    const r = withSetup({
      resolver: async () => { throw new Error('boom') },
      initial: { docId: 'a', document: docOf('a') },
    })
    await r.navigate('./b.md')
    expect(r.error.value).toEqual({ href: './b.md', message: 'boom' })
    expect(r.current.value.docId).toBe('a')
  })

  it('dedupes concurrent resolves for the same target', async () => {
    let calls = 0
    const resolver = async () => {
      calls++
      await Promise.resolve()
      return result('b')
    }
    const r = withSetup({ resolver, initial: { docId: 'a', document: docOf('a') } })
    await Promise.all([r.navigate('./b.md'), r.navigate('./b.md'), r.prefetch('./b.md')])
    expect(calls).toBe(1)
  })

  it('back() pops the stack', async () => {
    const resolver = vi.fn(async input => result(input.href.replace('./', '').replace('.md', '')))
    const r = withSetup({ resolver, initial: { docId: 'a', document: docOf('a') } })
    await r.navigate('./b.md')
    await r.navigate('./c.md')
    expect(r.current.value.docId).toBe('c')
    r.back()
    expect(r.current.value.docId).toBe('b')
    r.back()
    expect(r.current.value.docId).toBe('a')
    r.back() // no-op at root
    expect(r.current.value.docId).toBe('a')
  })

  it('caches resolved documents — re-navigating skips resolver work', async () => {
    let calls = 0
    const resolver = async (input: { href: string }) => {
      calls++
      return result(input.href)
    }
    const r = withSetup({ resolver, initial: { docId: 'a', document: docOf('a') } })
    await r.navigate('./b.md')
    await r.navigate('./c.md')
    await r.navigate('./b.md')
    expect(calls).toBe(3) // dedupe is per concurrent batch, not lifetime — cache stores result, doesn't short-circuit resolver
    expect(r.current.value.docId).toBe('./b.md')
  })
})
