/**
 * Quality + conflict gate for tag landing pages (`/skills/tag/<slug>`).
 *
 * Two concerns:
 *
 *  1. Quality. Free-form AI-generated tags include junk slugs that don't
 *     deserve their own page (generic words, versioned variants, very short
 *     tokens, thin-content tags with only a handful of skills). Indexing them
 *     creates thin/low-value SERP entries that drag domain authority.
 *
 *  2. Conflicts. Some slugs already power a dedicated marketing or cluster
 *     landing page (`/frameworks/react`, `/skills/<cluster>`). Letting the
 *     tag template render the same slug splits crawl signal and competes with
 *     ourselves. Redirect the tag URL to the canonical page instead.
 */

export const DERIVED_TAG_MIN_SKILLS = 10

const GENERIC_DENY = new Set([
  'tool',
  'tools',
  'code',
  'dev',
  'general',
  'util',
  'utils',
  'app',
  'apps',
  'library',
  'framework',
  'script',
  'scripts',
  'file',
  'files',
  'data',
  'project',
  'setup',
  'config',
  'automation',
  'development',
  'programming',
  'software',
  'workflow',
  'task',
  'tasks',
  'web',
  'system',
  'helper',
])

const RESERVED_SLUGS = new Set([
  'stats',
  'guide',
  'official',
  'index',
  'new',
  'tag',
])

/**
 * Slugs that should hand off to a canonical marketing page.
 * Hits to `/skills/tag/<slug>` get a 301 to the value here.
 */
export const MARKETING_REDIRECTS: Record<string, string> = {
  'vue': '/frameworks/vue',
  'react': '/frameworks/react',
  'nextjs': '/frameworks/nextjs',
  'nuxt': '/frameworks/nuxt',
  'debug': '/skills/debug',
  'docs': '/skills/docs',
  'plan': '/skills/plan',
  'review': '/skills/review',
  'ship': '/skills/ship',
  'master-agent': '/skills/master-agent',
}

export function getTagRedirect(slug: string): string | null {
  return MARKETING_REDIRECTS[slug] ?? null
}

/**
 * True when an AI-derived tag earns its own landing page.
 * Controlled-vocab tags (TAG_BY_SLUG) are trusted and skip this gate; only
 * the marketing-conflict redirect applies to them.
 */
export function isQualityDerivedTag(slug: string, skillCount: number): boolean {
  if (skillCount < DERIVED_TAG_MIN_SKILLS)
    return false
  if (slug.length < 3)
    return false
  if (/\d/.test(slug))
    return false
  if (GENERIC_DENY.has(slug))
    return false
  if (MARKETING_REDIRECTS[slug])
    return false
  if (RESERVED_SLUGS.has(slug))
    return false
  return true
}
