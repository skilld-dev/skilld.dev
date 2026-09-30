/**
 * What a `/gh/<owner>/<repo>/<name>` page knows about its Skill, as data.
 *
 * `missing` is a 404 from the Skill API: the registry holds no row. A Skill
 * that is real on GitHub but outside the registry lands here too, because the
 * skill route never proxies GitHub. The repository hub is the proxied surface.
 */
export type SkillPageInput
  = | { _tag: 'loading' }
    | { _tag: 'failed' }
    | { _tag: 'missing' }
    | {
      _tag: 'loaded'
      indexable: boolean
      /** The SKILL.md was deleted upstream; the site keeps a tombstone. */
      sourceGone: boolean
      registryPath: string
      /** Set when a stronger duplicate owns this content. */
      duplicateCanonicalPath: string | null
    }

export interface SkillPageState {
  _tag: 'loading' | 'failed' | 'missing' | 'gone' | 'duplicate' | 'indexable' | 'noindex'
  /** HTTP status to force, or null to leave the response alone. */
  status: 404 | 410 | null
  robots: 'index,follow' | 'noindex,follow'
  /** Site path for the canonical link, or null to omit the link. */
  canonicalPath: string | null
}

/**
 * Decide the status, robots directive, and canonical for a Skill page.
 *
 * A canonical must name a page that exists. The old code fell back to the
 * site root when no Skill loaded, which told Google that every made-up URL
 * duplicated the homepage. Google read those as soft 404s (2,621 pages on
 * 2026-09-30). A page with no Skill now omits the canonical.
 */
export function resolveSkillPageState(input: SkillPageInput): SkillPageState {
  switch (input._tag) {
    case 'missing':
      return { _tag: 'missing', status: 404, robots: 'noindex,follow', canonicalPath: null }
    case 'loading':
    case 'failed':
      return { _tag: input._tag, status: null, robots: 'noindex,follow', canonicalPath: null }
    case 'loaded': {
      if (input.sourceGone)
        return { _tag: 'gone', status: 410, robots: 'noindex,follow', canonicalPath: input.registryPath }
      if (input.duplicateCanonicalPath)
        return { _tag: 'duplicate', status: null, robots: 'noindex,follow', canonicalPath: input.duplicateCanonicalPath }
      return input.indexable
        ? { _tag: 'indexable', status: null, robots: 'index,follow', canonicalPath: input.registryPath }
        : { _tag: 'noindex', status: null, robots: 'noindex,follow', canonicalPath: input.registryPath }
    }
  }
}
