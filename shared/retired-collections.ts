/**
 * Collections retired on 2026-09-30 (Sprint 0 hygiene). Rows stay in D1 and
 * carry `deleted_at` (migration 0130); the URL answers with a redirect or 410.
 *
 * Targets:
 * - `agent-building-stack`, `agent-workflow-stack`: the same audience as the
 *   `agent-building` and `agent-workflow` collections, which already 301 to
 *   `/skills/context-engineering`.
 * - `typescript-engineering-stack`: general coding practice, so it follows
 *   `essentials` to `/skills/coding`.
 * - `apple-apps`, `knowledge-workspace`: no category page absorbed them
 *   (see MERGED_COLLECTIONS), so they answer 410.
 */
export type RetiredCollectionOutcome
  = | { _tag: 'redirect', to: string }
    | { _tag: 'gone' }

export interface RetiredCollection {
  author: string
  slug: string
  outcome: RetiredCollectionOutcome
}

export const RETIRED_COLLECTIONS: readonly RetiredCollection[] = [
  { author: 'harlan-zw', slug: 'agent-building-stack', outcome: { _tag: 'redirect', to: '/skills/context-engineering' } },
  { author: 'harlan-zw', slug: 'agent-workflow-stack', outcome: { _tag: 'redirect', to: '/skills/context-engineering' } },
  { author: 'harlan-zw', slug: 'typescript-engineering-stack', outcome: { _tag: 'redirect', to: '/skills/coding' } },
  { author: 'harlan-zw', slug: 'apple-apps', outcome: { _tag: 'gone' } },
  { author: 'harlan-zw', slug: 'knowledge-workspace', outcome: { _tag: 'gone' } },
]

export function retiredCollectionPath(collection: Pick<RetiredCollection, 'author' | 'slug'>): string {
  return `/@${collection.author}/${collection.slug}`
}

/** The retirement for a request path, or null. Ignores a trailing slash and the query. */
export function findRetiredCollection(path: string): RetiredCollection | null {
  const pathname = path.split(/[?#]/, 1)[0]!.replace(/\/+$/, '')
  return RETIRED_COLLECTIONS.find(c => retiredCollectionPath(c) === pathname) ?? null
}

export function isRetiredCollection(author: string, slug: string): boolean {
  return RETIRED_COLLECTIONS.some(c => c.author === author && c.slug === slug)
}

/** Nitro route rules for the redirecting retirements. The 410s live in middleware. */
export function retiredCollectionRedirectRules(): Record<string, { redirect: { to: string, statusCode: 301 } }> {
  const rules: Record<string, { redirect: { to: string, statusCode: 301 } }> = {}
  for (const c of RETIRED_COLLECTIONS) {
    if (c.outcome._tag === 'redirect')
      rules[retiredCollectionPath(c)] = { redirect: { to: c.outcome.to, statusCode: 301 } }
  }
  return rules
}

/** Drops retired collections, and any author whose only rows were retired. Runs before the migration lands too. */
export function withoutRetiredCollections<T extends { author_login: string, slug: string }>(rows: readonly T[]): T[] {
  return rows.filter(row => !isRetiredCollection(row.author_login, row.slug))
}
