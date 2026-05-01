const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/
const KEY_LINE_RE = /^([A-Z_][\w-]*):(.*)$/i
const QUOTE_TRIM_RE = /^['"]|['"]$/g
const NEWLINE_SPLIT_RE = /\r?\n/

export interface SkillFrontmatter {
  name?: string
  description?: string
  [key: string]: string | undefined
}

/**
 * Lenient SKILL.md frontmatter parser. Returns whatever keys it finds.
 * Folded scalars (`description: >`) collapse onto the next indented line(s).
 * Never throws; missing or malformed frontmatter returns an empty object.
 */
export function parseFrontmatter(raw: string): SkillFrontmatter {
  const m = raw.match(FRONTMATTER_RE)
  if (!m)
    return {}
  const fm: SkillFrontmatter = {}
  let lastKey: string | null = null
  for (const line of m[1]!.split(NEWLINE_SPLIT_RE)) {
    const km = line.match(KEY_LINE_RE)
    if (km) {
      lastKey = km[1]!
      const value = km[2]!.trim().replace(QUOTE_TRIM_RE, '')
      fm[lastKey] = value === '>' || value === '|' ? '' : value
    }
    else if (lastKey && line.startsWith('  ')) {
      fm[lastKey] = `${fm[lastKey] || ''} ${line.trim()}`.trim()
    }
  }
  return fm
}

const TITLE_SPLIT_RE = /[-_\s]+/
const SLUGIFY_STRIP_RE = /[^a-z0-9-]+/g
const SLUGIFY_DEDUPE_DASH_RE = /-+/g
const SLUGIFY_TRIM_DASH_RE = /^-+|-+$/g

export function titleCaseFromSlug(s: string): string {
  return s
    .split(TITLE_SPLIT_RE)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function slugifySkillName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(SLUGIFY_STRIP_RE, '')
    .replace(SLUGIFY_DEDUPE_DASH_RE, '-')
    .replace(SLUGIFY_TRIM_DASH_RE, '')
}

export interface ParsedSkill {
  name: string
  displayName: string
  description: string | null
}

/**
 * Parse a SKILL.md file given its raw body and the directory it lives in.
 * Returns null if the directory name does not slugify to a usable identifier.
 *
 * `name` (slug) always derives from `dirName` — frontmatter `name:` is treated
 * as a display title, not a slug.
 */
const SLUG_LOOKING_RE = /^[a-z0-9][a-z0-9-]*$/

export function parseSkillFile(raw: string, dirName: string): ParsedSkill | null {
  const name = slugifySkillName(dirName)
  if (!name)
    return null
  const fm = raw ? parseFrontmatter(raw) : {}
  const fmName = fm.name?.trim()
  const displayName = fmName && !SLUG_LOOKING_RE.test(fmName)
    ? fmName
    : titleCaseFromSlug(name)
  return {
    name,
    displayName,
    description: fm.description?.trim() || null,
  }
}
