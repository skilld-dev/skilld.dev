/**
 * Freeze audit, 2026-09-30. VISION principle 2: every indexable surface names
 * its target query, its admission bar, and its cull path.
 *
 * About 15 marketing pages went live on and after 2026-09-04 with none of the
 * three on record. This file is the record. A page in `FREEZE_AUDIT_PATHS`
 * that has no entry in `PAGE_ADMISSIONS` renders `noindex,follow` and leaves
 * the pages sitemap. To admit one, add an entry with a measured target query.
 *
 * ADMISSION BAR. An exact-match target query with at least 100 measured
 * searches a month (NuxtSEO `research keywords`, pulled 2026-09-30; each
 * entry below records its own measurement), or a named role in the
 * 2026-11-11 gate experiments. Competitor brand queries do not qualify: they
 * are navigational, and a directory cannot win them.
 *
 * CULL PATH, for every entry. Remove the entry. The page then renders noindex
 * and drops from the sitemap on the next deploy. Decide at the 2026-11-11
 * gate on the panel result: keep, widen, or cut.
 */

export interface PageAdmission {
  /** Query the page is written to answer. */
  targetQuery: string
  /** Why it clears the bar, with the measurement. */
  admissionBar: string
}

/** Pages added on or after 2026-09-04 that the audit covers. */
export const FREEZE_AUDIT_PATHS: readonly string[] = [
  '/agents',
  '/agents/claude-code',
  '/agents/codex',
  '/agents/cursor',
  '/agents/gemini-cli',
  '/agents/github-copilot',
  '/agents/hermes',
  '/agents/openclaw',
  '/agents/opencode',
  '/agents/windsurf',
  '/vs/context7',
  '/vs/skills-sh',
  '/verify',
  '/docs/cli',
  '/cli',
  '/developers',
  '/developers/mcp',
  '/skillgen',
  '/privacy',
  '/terms',
  '/learn/private-repositories',
  '/learn/create-agent-skills',
  '/learn/author-project-skills',
  '/learn/author-npm-package-skills',
  '/learn/author-pypi-package-skills',
  '/learn/author-ruby-package-skills',
  '/learn/author-rust-package-skills',
  '/learn/author-go-package-skills',
  '/skills/demos',
]

export const PAGE_ADMISSIONS: Readonly<Record<string, PageAdmission>> = {
  '/skills/demos': {
    targetQuery: 'claude skills examples',
    admissionBar: '720 searches a month, KD 32. NuxtSEO research keywords, 2026-10-06. Holds only demos a human approved by merging, and renders noindex below six. Covers each demo page, `/skills/demos/<owner>/<repo>/<name>`, which targets "<skill> skill example" (owner-approved 2026-10-07; volume not measured). Review at the 2026-11-11 gate.',
  },
  '/compare/humanize-writing-skills': {
    targetQuery: 'best humanizer skill for claude',
    admissionBar: 'Experiment F, owner-approved 2026-10-05: one original source comparison with contextual internal links. Query estimate: 30 US searches a month, below the volume bar. Retain admission at the 2026-11-11 gate only if indexed with relevant query impressions.',
  },
  '/learn/create-agent-skills': {
    targetQuery: 'how to create claude skills',
    admissionBar: '390 US searches a month, KD 30. NuxtSEO research keywords, 2026-10-05. One cross-Agent authoring pilot; review at the 2026-11-11 gate.',
  },
  '/agents/codex': {
    targetQuery: 'codex skills',
    admissionBar: '4,400 searches a month, KD 4. No directory ranks; forums and Reddit hold the results.',
  },
  '/agents/cursor': {
    targetQuery: 'cursor skills',
    admissionBar: '2,900 searches a month, KD 7. The best competitor page sits at position 25.',
  },
  '/agents/claude-code': {
    targetQuery: 'claude code agent skill',
    admissionBar: '390 searches a month. The head term "claude skills" is served by the homepage and /skills.',
  },
  '/vs/context7': {
    targetQuery: 'context7 vs skills',
    admissionBar: 'The human-written template that experiment C rolls out to concept pages. No measured volume; kept as the control.',
  },
}

/** True when the audit covers the path. Agent and comparison pages always count. */
function isAudited(path: string): boolean {
  return FREEZE_AUDIT_PATHS.includes(path) || path.startsWith('/agents/') || path === '/compare' || path.startsWith('/compare/')
}

/**
 * True when the page may be `index,follow`. Pages outside the audit are
 * unchanged. Every `/agents/*` page counts as audited, so a new Agent page
 * starts noindex until someone admits it.
 */
export function isPageAdmitted(path: string): boolean {
  if (!isAudited(path))
    return true
  return Object.hasOwn(PAGE_ADMISSIONS, path)
}

export function pageRobots(path: string): 'index,follow' | 'noindex,follow' {
  return isPageAdmitted(path) ? 'index,follow' : 'noindex,follow'
}

/**
 * Paths the pages sitemap must skip, because their pages render noindex.
 *
 * Pass every route the app defines. The result then holds each audited route
 * that `isPageAdmitted` refuses, including an `/agents/*` page nobody listed
 * in `FREEZE_AUDIT_PATHS`. The sitemap and the page read the same decision.
 */
export function frozenNoindexPaths(routes: readonly string[] = []): string[] {
  const candidates = new Set([...FREEZE_AUDIT_PATHS, ...routes.filter(isAudited)])
  return [...candidates].filter(path => !isPageAdmitted(path))
}
