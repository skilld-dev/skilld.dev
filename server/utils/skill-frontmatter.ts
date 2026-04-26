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

export function titleCaseFromSlug(s: string): string {
  return s
    .split(TITLE_SPLIT_RE)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export interface ParsedSkill {
  name: string
  displayName: string
  description: string | null
}

/**
 * Parse a SKILL.md file given its raw body and the directory it lives in.
 * Returns null if neither frontmatter `name` nor a usable directory name resolves.
 */
export function parseSkillFile(raw: string, dirName: string): ParsedSkill | null {
  const fm = raw ? parseFrontmatter(raw) : {}
  const name = (fm.name || dirName).trim()
  if (!name)
    return null
  return {
    name,
    displayName: titleCaseFromSlug(name),
    description: fm.description?.trim() || null,
  }
}
