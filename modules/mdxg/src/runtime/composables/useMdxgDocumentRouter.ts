import type { Ref } from 'vue'
import type { MdxgDocument, MdxgLinkResolveInput, MdxgLinkResolver, MdxgLinkResolveResult } from '../types'
import { computed, onBeforeUnmount, readonly, ref } from 'vue'

export interface UseMdxgRouterOptions {
  resolver: MdxgLinkResolver
  initial: { docId: string, document: MdxgDocument, url?: string, title?: string }
  // LRU cap on the in-memory document cache. Default 16.
  maxCache?: number
  onError?: (err: unknown, input: MdxgLinkResolveInput) => void
}

export interface UseMdxgRouter {
  current: Ref<{ docId: string, document: MdxgDocument }>
  stack: Readonly<Ref<readonly string[]>>
  isLoading: Readonly<Ref<boolean>>
  pendingFragment: Readonly<Ref<string | undefined>>
  error: Readonly<Ref<{ href: string, message: string } | null>>
  navigate: (href: string, fromDocId?: string) => Promise<MdxgLinkResolveResult | null>
  prefetch: (href: string, fromDocId?: string) => Promise<void>
  back: () => void
  clearError: () => void
}

// Document-level routing for in-place markdown link traversal (MDXG §12).
// State lives client-side; SSR seeding is the host's responsibility (call the
// same resolver from your route handler and pass the result as `initial`).
export function useMdxgDocumentRouter(opts: UseMdxgRouterOptions): UseMdxgRouter {
  const initial = opts.initial
  const max = opts.maxCache ?? 16

  const cache = new Map<string, MdxgLinkResolveResult>()
  cache.set(initial.docId, { docId: initial.docId, document: initial.document, url: initial.url, title: initial.title })

  const stack = ref<string[]>([initial.docId])
  const currentId = ref<string>(initial.docId)
  const isLoading = ref(false)
  const pendingFragment = ref<string | undefined>(undefined)
  const error = ref<{ href: string, message: string } | null>(null)
  const inflight = new Map<string, Promise<MdxgLinkResolveResult | null>>()

  const current = computed(() => {
    const r = cache.get(currentId.value) ?? cache.get(initial.docId)!
    return { docId: r.docId, document: r.document }
  })

  function rememberResult(r: MdxgLinkResolveResult) {
    cache.set(r.docId, r)
    if (cache.size > max) {
      // Evict oldest non-current entries.
      for (const key of cache.keys()) {
        if (cache.size <= max)
          break
        if (key === currentId.value || key === initial.docId)
          continue
        cache.delete(key)
      }
    }
  }

  // Dedupe concurrent resolves keyed on (fromDocId, href).
  async function resolveOnce(input: MdxgLinkResolveInput) {
    const key = `${input.fromDocId}|${input.href}`
    const existing = inflight.get(key)
    if (existing)
      return existing
    const p = opts.resolver(input)
      .then((r) => {
        if (r)
          rememberResult(r)
        return r
      })
      .finally(() => {
        inflight.delete(key)
      })
    inflight.set(key, p)
    return p
  }

  function extractFragment(href: string): { path: string, fragment: string | undefined } {
    const idx = href.indexOf('#')
    if (idx < 0)
      return { path: href, fragment: undefined }
    return { path: href.slice(0, idx), fragment: href.slice(idx + 1) || undefined }
  }

  async function navigate(href: string, fromDocId?: string): Promise<MdxgLinkResolveResult | null> {
    const { fragment } = extractFragment(href)
    const input: MdxgLinkResolveInput = {
      href,
      fragment,
      fromDocId: fromDocId ?? currentId.value,
    }
    error.value = null
    isLoading.value = true
    try {
      const result = await resolveOnce(input)
      if (!result) {
        // MDXG §12.1: links to non-markdown / external targets fall through
        // to the host environment's default behavior.
        if (typeof window !== 'undefined')
          window.location.href = href
        return null
      }
      pendingFragment.value = fragment
      currentId.value = result.docId
      // Maintain a forward-flat stack (cap at maxCache so memory stays bounded).
      const next = [...stack.value, result.docId]
      stack.value = next.length > max ? next.slice(next.length - max) : next
      if (result.url && typeof window !== 'undefined')
        history.pushState({ mdxgDocId: result.docId }, '', result.url)
      return result
    }
    catch (err) {
      // MDXG §12.1 MUST: surface the error; do not silently navigate to empty.
      error.value = {
        href,
        message: err instanceof Error ? err.message : 'Failed to load document',
      }
      opts.onError?.(err, input)
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  async function prefetch(href: string, fromDocId?: string): Promise<void> {
    const { fragment } = extractFragment(href)
    await resolveOnce({
      href,
      fragment,
      fromDocId: fromDocId ?? currentId.value,
    }).catch(() => {})
  }

  function back() {
    if (stack.value.length <= 1)
      return
    stack.value = stack.value.slice(0, -1)
    const prev = stack.value[stack.value.length - 1]!
    currentId.value = prev
    if (typeof window !== 'undefined') {
      const entry = cache.get(prev)
      if (entry?.url)
        history.pushState({ mdxgDocId: prev }, '', entry.url)
    }
  }

  function clearError() {
    error.value = null
  }

  // Sync with browser back/forward when the host wires `result.url`.
  function onPopState(e: PopStateEvent) {
    const state = e.state as { mdxgDocId?: string } | null
    const id = state?.mdxgDocId
    if (!id || !cache.has(id))
      return
    currentId.value = id
    const idx = stack.value.lastIndexOf(id)
    if (idx >= 0)
      stack.value = stack.value.slice(0, idx + 1)
    else
      stack.value = [...stack.value, id]
  }

  if (typeof window !== 'undefined')
    window.addEventListener('popstate', onPopState)
  onBeforeUnmount(() => {
    if (typeof window !== 'undefined')
      window.removeEventListener('popstate', onPopState)
  })

  return {
    current,
    stack: readonly(stack),
    isLoading: readonly(isLoading),
    pendingFragment: readonly(pendingFragment),
    error: readonly(error),
    navigate,
    prefetch,
    back,
    clearError,
  }
}
