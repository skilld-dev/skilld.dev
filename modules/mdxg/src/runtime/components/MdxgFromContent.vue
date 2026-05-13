<script setup lang="ts">
import type { MDCParserResult, MdxgDocument, MdxgLinkResolver, MdxgLinkResolveResult, MdxgMode, MdxgPrefetchMode } from '../types'
import { computed } from 'vue'
import { mdxgFromParsed } from '../utils/mdxg'
import MdxgViewer from './MdxgViewer.vue'

// Loose shape from `queryCollection('...').first()`. Path is the conventional
// `_path` / `path` field on @nuxt/content page rows.
interface ContentRow {
  body: MDCParserResult['body']
  meta?: Record<string, unknown>
  toc?: MDCParserResult['toc']
  excerpt?: MDCParserResult['excerpt']
  path?: string
  _path?: string
  title?: string
}

const props = defineProps<{
  content: ContentRow
  // Content collection name. Required when `resolveLink` is left unset so the
  // default resolver knows which collection to query for linked documents.
  collection?: string
  pageHeadingDepth?: 1 | 2
  // Override the auto-wired resolver. Pass `false` to disable Document Links.
  resolveLink?: MdxgLinkResolver | false
  prefetch?: MdxgPrefetchMode
  syncHash?: boolean
  initialSlug?: string
  initialMode?: MdxgMode
  hidePageNav?: boolean
  hideOutline?: boolean
  hideSequential?: boolean
  hideSearch?: boolean
  hideModeToggle?: boolean
}>()

function rowToDocument(row: ContentRow): MdxgDocument {
  return mdxgFromParsed({
    body: row.body,
    data: (row.meta ?? {}) as MDCParserResult['data'],
    toc: row.toc,
    excerpt: row.excerpt,
  }, { pageHeadingDepth: props.pageHeadingDepth })
}

const doc = computed<MdxgDocument>(() => rowToDocument(props.content))
const docPath = computed(() => props.content.path ?? props.content._path ?? '')

// Resolve relative `href` against a base path (POSIX-style; no `..` past root).
function resolvePath(base: string, href: string): string {
  if (href.startsWith('/'))
    return href.replace(/[?#].*$/, '')
  const baseDir = base.replace(/\/[^/]*$/, '') || '/'
  const segs = (`${baseDir}/${href}`).split('/').filter(Boolean)
  const out: string[] = []
  for (const seg of segs) {
    if (seg === '.')
      continue
    if (seg === '..')
      out.pop()
    else
      out.push(seg.replace(/[?#].*$/, ''))
  }
  return `/${out.join('/')}`
}

// Default resolver: looks up the target file in the same @nuxt/content
// collection, normalizing common markdown extensions away. Only matches
// markdown files (.md / .mdx / no extension) — anything else returns null and
// falls through to default browser nav per MDXG §12.1.
const defaultResolver: MdxgLinkResolver = async (input) => {
  if (!props.collection)
    return null
  const trimmed = input.href.replace(/[?#].*$/, '')
  if (!/\.(md|mdx)$|^[^.]+$|\/$/.test(trimmed))
    return null
  const normalized = resolvePath(docPath.value || '/', trimmed).replace(/\.(md|mdx)$/, '')
  // Auto-imported by @nuxt/content; available globally on client + server.
  const row = await (queryCollection as any)(props.collection).path(normalized).first() as ContentRow | null
  if (!row)
    return null
  const result: MdxgLinkResolveResult = {
    docId: row.path ?? row._path ?? normalized,
    document: rowToDocument(row),
    title: typeof row.title === 'string' ? row.title : undefined,
    url: normalized,
  }
  return result
}

const effectiveResolver = computed<MdxgLinkResolver | undefined>(() => {
  if (props.resolveLink === false)
    return undefined
  return props.resolveLink ?? defaultResolver
})
</script>

<template>
  <MdxgViewer
    :document="doc"
    :doc-id="docPath"
    :resolve-link="effectiveResolver"
    :prefetch="prefetch"
    :sync-hash="syncHash"
    :initial-slug="initialSlug"
    :initial-mode="initialMode"
    :initial-url="docPath"
    :hide-page-nav="hidePageNav"
    :hide-outline="hideOutline"
    :hide-sequential="hideSequential"
    :hide-search="hideSearch"
    :hide-mode-toggle="hideModeToggle"
  />
</template>
