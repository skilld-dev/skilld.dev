<script setup lang="ts">
import type { MdxgDocument, MdxgLinkResolver, MdxgMode, MdxgPrefetchMode, MdxgSearchHit } from '../types'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useMdxgDocument } from '../composables/useMdxgDocument'
import { useMdxgDocumentRouter } from '../composables/useMdxgDocumentRouter'
import { useMdxgKeyboard } from '../composables/useMdxgKeyboard'
import { classifyDocLinkClick } from '../utils/link-classifier'
import MdxgModeToggle from './MdxgModeToggle.vue'
import MdxgOutline from './MdxgOutline.vue'
import MdxgPageNav from './MdxgPageNav.vue'
import MdxgPageView from './MdxgPageView.vue'
import MdxgSearch from './MdxgSearch.vue'
import MdxgSequentialNav from './MdxgSequentialNav.vue'

const props = defineProps<{
  document: MdxgDocument
  // Opaque id of the current document. Required when `resolveLink` is set so
  // the router can key its cache and history state. Defaults to '' otherwise.
  docId?: string
  syncHash?: boolean
  initialSlug?: string
  initialMode?: MdxgMode
  // Resolve cross-document markdown links (MDXG §12). When set, clicks on
  // relative `.md` links inside the rendered preview are intercepted and the
  // viewer swaps to the resolved document in place.
  resolveLink?: MdxgLinkResolver
  prefetch?: MdxgPrefetchMode
  initialUrl?: string
  hidePageNav?: boolean
  hideOutline?: boolean
  hideSequential?: boolean
  hideSearch?: boolean
  hideModeToggle?: boolean
  // When true, the toolbar (active-page title + mode toggle) is not rendered
  // at all. Use this when the host page already shows the active heading and
  // the mode toggle is hidden, to avoid a stray H1 from competing with the
  // host's heading outline.
  hideToolbar?: boolean
}>()

const emit = defineEmits<{
  linkError: [info: { href: string, message: string }]
  navigate: [docId: string]
}>()

// When a resolver is supplied, document state flows through the router;
// otherwise the viewer renders the static `:document` prop.
const router = props.resolveLink
  ? useMdxgDocumentRouter({
      resolver: props.resolveLink,
      initial: { docId: props.docId ?? '', document: props.document, url: props.initialUrl },
      onError: (_err, input) => emit('linkError', { href: input.href, message: 'Failed to load' }),
    })
  : null

const activeDoc = computed<MdxgDocument>(() => router ? router.current.value.document : props.document)

const {
  doc,
  activeIndex,
  activePage,
  mode,
  goTo,
  goToFragment,
  next,
  prev,
} = useMdxgDocument(() => activeDoc.value, {
  syncHash: props.syncHash,
  initialSlug: props.initialSlug,
  initialMode: props.initialMode,
})

const search = ref<InstanceType<typeof MdxgSearch> | null>(null)
const previewEl = ref<HTMLElement | null>(null)

useMdxgKeyboard({
  next,
  prev,
  focusSearch: () => search.value?.focus(),
})

async function onSearchNavigate(index: number, _hit: MdxgSearchHit, query: string) {
  goTo(index)
  await nextTick()
  const root = previewEl.value
  if (!root || !query)
    return
  const needle = query.toLowerCase()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  // eslint-disable-next-line no-cond-assign
  while ((node = walker.nextNode())) {
    if ((node.textContent ?? '').toLowerCase().includes(needle)) {
      ;(node.parentElement ?? root).scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
  }
}

// Whenever the active document switches via the router, honour the pending
// fragment (MDXG §12.1 SHOULD: navigate to the referenced heading or page).
if (router) {
  watch(
    () => router.current.value.docId,
    async (id) => {
      emit('navigate', id)
      const frag = router.pendingFragment.value
      if (frag) {
        await nextTick()
        await goToFragment(frag)
      }
    },
  )
}

// Delegated click interceptor on the preview region.
function onPreviewClick(e: MouseEvent) {
  if (!router)
    return
  const hit = classifyDocLinkClick(e)
  if (!hit)
    return
  e.preventDefault()
  void router.navigate(hit.href)
}

// Prefetch on hover/focus when configured. Idempotent — the router dedupes.
const prefetchMode = computed<MdxgPrefetchMode>(() => props.prefetch ?? 'hover')
let observer: IntersectionObserver | null = null

function prefetchFrom(target: EventTarget | null) {
  if (!router)
    return
  const anchor = (target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!anchor)
    return
  const href = anchor.getAttribute('href') ?? ''
  if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:\/\//i.test(href))
    return
  void router.prefetch(href)
}

function onPreviewPointerOver(e: PointerEvent) {
  if (prefetchMode.value !== 'hover')
    return
  prefetchFrom(e.target)
}

function bindViewportPrefetch() {
  if (!router || prefetchMode.value !== 'viewport' || !previewEl.value || typeof IntersectionObserver === 'undefined')
    return
  observer?.disconnect()
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting)
        continue
      const a = entry.target as HTMLAnchorElement
      void router.prefetch(a.getAttribute('href') ?? '')
      observer!.unobserve(a)
    }
  }, { rootMargin: '200px' })
  previewEl.value.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:\/\//i.test(href))
      return
    observer!.observe(a)
  })
}

watch([activeDoc, prefetchMode], async () => {
  await nextTick()
  bindViewportPrefetch()
}, { flush: 'post', immediate: true })

onBeforeUnmount(() => {
  observer?.disconnect()
})

const sourceVisible = computed(() => mode.value !== 'preview')
const previewVisible = computed(() => mode.value !== 'source')

const docTitle = computed(() => {
  const title = doc.value.document.frontmatter.title
  return typeof title === 'string' ? title : ''
})

const error = computed(() => router?.error.value ?? null)
const isLoading = computed(() => router?.isLoading.value ?? false)
function dismissError() {
  router?.clearError()
}
</script>

<template>
  <div class="mdxg-viewer" :data-mode="mode" :data-loading="isLoading || undefined">
    <aside v-if="!hidePageNav || !hideSearch" class="mdxg-aside-start">
      <header v-if="docTitle" class="mdxg-doc-title">
        {{ docTitle }}
      </header>
      <MdxgSearch
        v-if="!hideSearch"
        ref="search"
        :doc="doc"
        @navigate="onSearchNavigate"
      />
      <MdxgPageNav
        v-if="!hidePageNav"
        :doc="doc"
        :active-index="activeIndex"
        @navigate="goTo"
      />
    </aside>

    <main class="mdxg-main">
      <header
        v-if="!hideToolbar"
        class="mdxg-toolbar"
      >
        <h1 class="mdxg-active-title">
          {{ activePage.title }}
        </h1>
        <MdxgModeToggle
          v-if="!hideModeToggle"
          v-model="mode"
        />
      </header>

      <div
        v-if="error"
        class="mdxg-error"
        role="alert"
      >
        Couldn't load <code>{{ error.href }}</code>{{ error.message ? `: ${error.message}` : '' }}
        <button type="button" @click="dismissError">
          Dismiss
        </button>
      </div>

      <div class="mdxg-content">
        <section
          v-if="previewVisible"
          ref="previewEl"
          class="mdxg-preview"
          @click="onPreviewClick"
          @pointerover="onPreviewPointerOver"
        >
          <MdxgPageView :page="activePage" />
        </section>
        <section v-if="sourceVisible && (activePage.source ?? doc.source)" class="mdxg-source">
          <pre><code>{{ activePage.source ?? doc.source }}</code></pre>
        </section>
      </div>

      <MdxgSequentialNav
        v-if="!hideSequential"
        :doc="doc"
        :active-index="activeIndex"
        @navigate="goTo"
      />
    </main>

    <aside v-if="!hideOutline && activePage.outline.length" class="mdxg-aside-end">
      <MdxgOutline :page="activePage" />
    </aside>
  </div>
</template>
