/**
 * Every demo has its own page at `/skills/demos/<owner>/<repo>/<name>`, the
 * board with that demo on the stage. The pages share the `/skills/demos`
 * admission in `page-admissions.ts`, and the `demos` sitemap lists them.
 *
 * This module imports nothing, so the app and the server both load it.
 */

export const DEMOS_PATH = '/skills/demos'

/** Below this many demos, `/skills/demos` and every demo page answer noindex, and the sitemap lists none. */
export const MIN_INDEXABLE_DEMOS = 6

export function demoPagePath(demo: { owner: string, repo: string, name: string }): string {
  return `${DEMOS_PATH}/${demo.owner}/${demo.repo}/${demo.name}`
}

export type DemoRoute
  = | { _tag: 'index' }
    | { _tag: 'demo', key: string }
    | { _tag: 'invalid' }

/**
 * Reads the path segments after `/skills/demos`: none is the board, three
 * name one demo as `owner/repo/name`, and any other count is no page.
 */
export function parseDemoRoute(segments: string | readonly string[] | undefined): DemoRoute {
  const parts = (typeof segments === 'string' ? segments.split('/') : segments ?? []).filter(Boolean)
  if (parts.length === 0)
    return { _tag: 'index' }
  if (parts.length === 3)
    return { _tag: 'demo', key: parts.join('/') }
  return { _tag: 'invalid' }
}
