<script setup lang="ts">
import type { MdxgDocument, MdxgLinkResolver, MdxgLinkResolveResult } from '../../../modules/mdxg/src/runtime/types'

// Dev-only sandbox for the nuxt-mdxg module. 404s in production.
// Client-rendered so the bundled Shiki highlighter (browser-side Oniguruma
// WASM) can decorate code blocks; SSR-only Cloudflare workerd can't load it.
definePageMeta({
  layout: false,
  ssr: false,
  validate: () => import.meta.dev,
})
useHead({ title: 'MDXG Playground' })

const SOURCES: Record<string, { title: string, source: string }> = {
  '/index': {
    title: 'Index',
    source: `---
title: MDXG Playground Index
---

Welcome to the **mdxg** playground. Three docs are loaded here, linked to each other; click any link below to exercise Document Links in place — no full page reload, history pushes, prefetch on hover.

\`\`\`ts
import { parseMdxg } from 'nuxt-mdxg'

const doc = await parseMdxg(source)
// → MdxgDocument { pages, toc, data, body, source }
\`\`\`

## Quick links

- [Read the spec walkthrough](./spec.md)
- [Try the tutorial](./tutorial.md#first-steps)
- A [broken link](./does-not-exist.md) demonstrates the inline error banner.
- An [external link](https://example.com) falls through to default nav.

## What to look for

- Sidebar **Pages** nav (this doc only has one page; check the spec).
- **Outline** on the right with scroll-spy.
- **Search** field with ↑/↓ + Enter.
- **Mode** toggle: Preview / Markdown / Both.
- Hash sync: clicking pages updates \`#page=...\`.

## Syntax highlighting check

\`\`\`ts
import { parseMdxg } from 'nuxt-mdxg'

export async function loadDoc(source: string) {
  const doc = await parseMdxg(source)
  return doc.pages
}
\`\`\`

\`\`\`vue
<template>
  <MdxgViewer :document="doc" :resolve-link="resolver" prefetch="hover" />
</template>
\`\`\`
`,
  },
  '/spec': {
    title: 'Spec walkthrough',
    source: `---
title: MDXG Spec Walkthrough
---

A multi-page document. Heading depth 2 means each H2 below opens a new virtual page.

## Virtual Pages

Content here lives on the **Virtual Pages** page. The intro paragraph above is on an implicit Introduction page.

### How splitting works

Every H1 or H2 in the source becomes a virtual page. Content before the first such heading becomes an implicit Introduction.

### Why it matters

A 3,000-line SPEC stops being a 27-screen scroll and becomes navigable.

## Page Navigation

Cross-page nav lists every H1/H2 in document order. Active state tracks the current page.

### Affordances

- Click a page entry to jump.
- Keyboard ← / → walks the sequential nav.
- Search results jump across pages and scroll to the match.

## Page Outline

H3–H6 within the **current** page only. This page has these third-level entries:

### Anchor one

Some prose for anchor one.

### Anchor two

Some prose for anchor two.

### Anchor three

Some prose for anchor three. Linking to [the tutorial](./tutorial.md) demonstrates Document Links.

## Search

Search runs across all virtual pages. Try typing \`anchor\` in the sidebar — three matches will appear.

## Code Blocks

\`\`\`ts
import { parseMdxg } from 'nuxt-mdxg'

const doc = await parseMdxg(source)
\`\`\`

Hover the code block to see the copy button.
`,
  },
  '/tutorial': {
    title: 'Tutorial',
    source: `---
title: MDXG Tutorial
---

A short doc to round out the playground.

## First steps

1. Install the module.
2. Parse some markdown with \`parseMdxg\`.
3. Render with \`<MdxgViewer>\`.

For deeper coverage, see [virtual pages in the spec](./spec.md#virtual-pages) or jump [back to the index](./index.md).

## Tables

| Capability | Required | Notes |
|---|---|---|
| Virtual pages | MUST | Spec §6 |
| Outline | SHOULD | Spec §8 |
| Document links | SHOULD | Spec §12 |

## Task list

- [x] Spec read
- [x] Module built
- [ ] Shipped to mdream.dev
`,
  },
}

const cache = new Map<string, MdxgDocument>()

async function load(id: string): Promise<MdxgDocument | null> {
  const entry = SOURCES[id]
  if (!entry)
    return null
  let doc = cache.get(id)
  if (!doc) {
    doc = await parseMdxg(entry.source)
    cache.set(id, doc)
  }
  return doc
}

function resolveRelative(base: string, href: string): string {
  const clean = href.replace(/[?#].*$/, '')
  if (clean.startsWith('/'))
    return clean.replace(/\.(md|mdx)$/, '')
  const baseDir = base.replace(/\/[^/]*$/, '') || '/'
  const segs = (`${baseDir}/${clean}`).split('/').filter(Boolean)
  const out: string[] = []
  for (const seg of segs) {
    if (seg === '.')
      continue
    if (seg === '..')
      out.pop()
    else
      out.push(seg)
  }
  return `/${out.join('/')}`.replace(/\.(md|mdx)$/, '')
}

const initialId = '/index'
const { data: initialDoc } = await useAsyncData('mdxg-playground-initial', () => load(initialId))

const resolver: MdxgLinkResolver = async (input) => {
  const target = resolveRelative(input.fromDocId || initialId, input.href)
  const doc = await load(target)
  if (!doc)
    return null
  const result: MdxgLinkResolveResult = {
    docId: target,
    document: doc,
    title: SOURCES[target]?.title,
    url: `/_playground/mdxg?doc=${encodeURIComponent(target)}`,
  }
  return result
}
</script>

<template>
  <div class="playground">
    <header class="playground-header">
      <strong>nuxt-mdxg</strong>
      <span class="playground-tag">dev playground</span>
      <span class="playground-spacer" />
      <small>
        <code>resolveLink</code> wired · <code>prefetch=hover</code> · <code>syncHash</code>
      </small>
    </header>

    <MdxgViewer
      v-if="initialDoc"
      :document="initialDoc"
      :doc-id="initialId"
      :resolve-link="resolver"
      :initial-url="`/_playground/mdxg?doc=${encodeURIComponent(initialId)}`"
      prefetch="hover"
      sync-hash
    />
  </div>
</template>

<style scoped>
/* Map mdxg's portable tokens onto skilld's design system so the playground
   feels native: warm stone surfaces, rose accent (10% budget), mono UI chrome,
   border-driven hierarchy. The mdxg module ships its own --mdxg-* tokens so
   it stays portable; here we override them at the page scope. */
.playground {
  --mdxg-color-fg: var(--ui-text);
  --mdxg-color-muted: var(--ui-text-muted);
  --mdxg-color-bg: var(--ui-bg);
  --mdxg-color-surface: var(--ui-bg-muted);
  --mdxg-color-border: var(--ui-border);
  --mdxg-color-accent: var(--ui-color-primary-500);
  --mdxg-color-accent-soft: color-mix(in oklch, var(--ui-color-primary-500) 12%, transparent);
  --mdxg-color-mark: color-mix(in oklch, var(--ui-color-primary-500) 30%, var(--ui-bg-elevated));
  --mdxg-radius: var(--ui-radius);
  --mdxg-space: 0.75rem;
  --mdxg-font-mono: var(--font-mono);

  max-width: var(--ui-container, 1280px);
  margin: 0 auto;
  padding: 1rem 1.5rem 4rem;
  font-family: var(--font-sans);
}

/* Quiet UI chrome: mono, small, muted, border-only boundaries. */
.playground :deep(.mdxg-page-nav button),
.playground :deep(.mdxg-outline-item a),
.playground :deep(.mdxg-mode-toggle button),
.playground :deep(.mdxg-seq-nav button),
.playground :deep(.mdxg-search input),
.playground :deep(.mdxg-search-results button),
.playground :deep(.mdxg-doc-title),
.playground :deep(.mdxg-active-title) {
  font-family: var(--font-mono);
}

.playground :deep(.mdxg-active-title) {
  font-size: 0.9rem;
  font-weight: 500;
  letter-spacing: -0.01em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  letter-spacing: 0.08em;
}

.playground :deep(.mdxg-page) {
  font-family: var(--font-sans);
}

.playground :deep(.mdxg-toolbar) {
  border-bottom-color: var(--ui-border);
}

.playground :deep(.mdxg-mode-toggle button.active) {
  background: var(--ui-color-primary-500);
  color: var(--ui-text-inverted);
}

/* Page header (the playground's own chrome). */
.playground-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0 1rem;
  border-bottom: 1px solid var(--ui-border);
  margin-bottom: 1rem;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.playground-header strong {
  color: var(--ui-text);
  font-weight: 600;
}
.playground-tag {
  background: color-mix(in oklch, var(--ui-color-primary-500) 12%, transparent);
  color: var(--ui-color-primary-500);
  padding: 0.15rem 0.4rem;
  border-radius: var(--ui-radius);
  font-size: 0.7rem;
}
.playground-spacer { flex: 1; }
.playground-header :deep(code),
.playground-header code {
  background: var(--ui-bg-elevated);
  padding: 0 0.25rem;
  border-radius: 3px;
  font-family: var(--font-mono);
  text-transform: none;
  letter-spacing: 0;
}
</style>
