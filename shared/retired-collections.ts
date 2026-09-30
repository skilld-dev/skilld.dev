/**
 * Two groups of harlan-zw collections, both decided on 2026-09-30.
 *
 * RETIRED_COLLECTIONS: no category page absorbed them (see MERGED_COLLECTIONS),
 * so the URL answers 410 and migration 0130 soft-deletes the rows.
 *
 * NOINDEX_COLLECTIONS: the old featured trio. They stay live and featured in
 * D1 on purpose. `/api/collections/featured` reads only featured rows, so
 * retiring them would empty the homepage band. Retiring them would also drop
 * `curator_count` and `curator_reason_count`, which count live collections only
 * and gate indexability for some Skills. Their pages render `noindex,follow` and
 * stay out of the authors sitemap. Revisit once other collections are featured
 * and the curator signals no longer depend on these rows.
 */
export interface CollectionRef {
  author: string
  slug: string
}

export const RETIRED_COLLECTIONS: readonly CollectionRef[] = [
  { author: 'harlan-zw', slug: 'apple-apps' },
  { author: 'harlan-zw', slug: 'knowledge-workspace' },
]

export const NOINDEX_COLLECTIONS: readonly CollectionRef[] = [
  { author: 'harlan-zw', slug: 'agent-building-stack' },
  { author: 'harlan-zw', slug: 'agent-workflow-stack' },
  { author: 'harlan-zw', slug: 'typescript-engineering-stack' },
]

export function retiredCollectionPath(collection: CollectionRef): string {
  return `/@${collection.author}/${collection.slug}`
}

/**
 * The retirement for a request path, or null. Ignores a trailing slash and the
 * query, and reads the percent-encoded `/%40login/...` form as `/@login/...`.
 */
export function findRetiredCollection(path: string): CollectionRef | null {
  const raw = path.split(/[?#]/, 1)[0]!
  let pathname: string
  try {
    pathname = decodeURIComponent(raw)
  }
  catch {
    // A malformed escape cannot name a collection.
    return null
  }
  pathname = pathname.replace(/\/+$/, '')
  return RETIRED_COLLECTIONS.find(c => retiredCollectionPath(c) === pathname) ?? null
}

function has(list: readonly CollectionRef[], author: string, slug: string): boolean {
  return list.some(c => c.author === author && c.slug === slug)
}

export function isRetiredCollection(author: string, slug: string): boolean {
  return has(RETIRED_COLLECTIONS, author, slug)
}

export function isNoindexCollection(author: string, slug: string): boolean {
  return has(NOINDEX_COLLECTIONS, author, slug)
}

/** Drops collections that must stay out of the sitemap. Runs before the migration lands too. */
export function withoutUnindexedCollections<T extends { author_login: string, slug: string }>(rows: readonly T[]): T[] {
  return rows.filter(row => !isRetiredCollection(row.author_login, row.slug) && !isNoindexCollection(row.author_login, row.slug))
}
