import type { MdxgDocument, MdxgMode, MdxgPage, MdxgSearchHit } from '../types'
import { computed, nextTick, ref, watch } from 'vue'
import { searchMdxg } from '../utils/mdxg'

export interface UseMdxgDocumentOptions {
  // Sync the active page slug to the URL hash (`#page=<slug>`).
  syncHash?: boolean
  initialSlug?: string
  initialMode?: MdxgMode
}

export function useMdxgDocument(document: () => MdxgDocument, opts: UseMdxgDocumentOptions = {}) {
  const doc = computed(document)

  const initial = opts.initialSlug ?? readHashSlug()
  const activeIndex = ref(resolveIndex(doc.value, initial))
  const mode = ref<MdxgMode>(opts.initialMode ?? 'preview')

  const activePage = computed<MdxgPage>(() => doc.value.pages[activeIndex.value] ?? doc.value.pages[0]!)
  const hasPrev = computed(() => activeIndex.value > 0)
  const hasNext = computed(() => activeIndex.value < doc.value.pages.length - 1)

  // When the document itself swaps (router navigation), reset to first page
  // unless a fragment specifies otherwise via goToFragment.
  watch(doc, () => {
    activeIndex.value = 0
  })

  function goTo(target: number | string) {
    const idx = typeof target === 'number' ? target : resolveIndex(doc.value, target)
    if (idx < 0 || idx >= doc.value.pages.length)
      return
    activeIndex.value = idx
  }

  // Resolve a fragment to either a page slug or a heading id within any page.
  // Returns true when a match was found and navigation happened.
  async function goToFragment(fragment: string): Promise<boolean> {
    if (!fragment)
      return false
    // 1. Match a page slug directly.
    const slugIdx = doc.value.pages.findIndex(p => p.slug === fragment)
    if (slugIdx >= 0) {
      activeIndex.value = slugIdx
      return true
    }
    // 2. Match a heading id within any page's outline.
    for (let i = 0; i < doc.value.pages.length; i++) {
      const page = doc.value.pages[i]!
      if (page.outline.some(o => o.id === fragment)) {
        activeIndex.value = i
        await nextTick()
        if (typeof window !== 'undefined') {
          window.document.getElementById(fragment)?.scrollIntoView({ block: 'start' })
        }
        return true
      }
    }
    return false
  }

  function next() {
    if (hasNext.value)
      activeIndex.value++
  }
  function prev() {
    if (hasPrev.value)
      activeIndex.value--
  }

  function search(query: string, limit?: number): MdxgSearchHit[] {
    return searchMdxg(doc.value, query, limit)
  }

  if (opts.syncHash && typeof window !== 'undefined') {
    watch(activePage, (p) => {
      const current = window.location.hash
      const next = `#page=${p.slug}`
      if (current !== next)
        history.replaceState(history.state, '', next)
    })
    window.addEventListener('hashchange', () => {
      const slug = readHashSlug()
      if (slug)
        goTo(slug)
    })
  }

  return {
    doc,
    activeIndex,
    activePage,
    mode,
    hasPrev,
    hasNext,
    goTo,
    goToFragment,
    next,
    prev,
    search,
  }
}

function readHashSlug(): string | undefined {
  if (typeof window === 'undefined')
    return undefined
  const m = window.location.hash.match(/page=([^&]+)/)
  return m?.[1]
}

function resolveIndex(doc: MdxgDocument, slug?: string): number {
  if (!slug)
    return 0
  const idx = doc.pages.findIndex(p => p.slug === slug)
  return idx >= 0 ? idx : 0
}
