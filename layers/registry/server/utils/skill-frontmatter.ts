import { parseDocument } from 'yaml'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/
const KEY_LINE_RE = /^([A-Z_][\w-]*):(.*)$/i
const QUOTE_TRIM_RE = /^['"]|['"]$/g
const NEWLINE_SPLIT_RE = /\r?\n/
const BLOCK_SCALAR_RE = /^([>|])(?:[+-]?[1-9]?|[1-9][+-]?)(?:\s+#.*)?$/

export interface ParsedFrontmatterDocument {
  frontmatter: Record<string, unknown>
  body: string
}

function parseFrontmatterValue(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed)
    return ''
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed)
    }
    catch {
      // Keep malformed collections as strings. This parser is intentionally lenient.
    }
  }
  return trimmed.replace(QUOTE_TRIM_RE, '')
}

function parseBlockScalar(style: string, lines: string[]): string {
  const indents = lines
    .filter(line => line.trim())
    .map(line => line.match(/^\s*/)?.[0].length ?? 0)
  const indent = indents.length ? Math.min(...indents) : 0
  const content = lines.map(line => line.trim() ? line.slice(indent) : '')
  if (style === '|')
    return content.join('\n').replace(/\n+$/, '')

  return content.reduce((text, line) => {
    if (!line)
      return `${text}\n`
    if (!text || text.endsWith('\n'))
      return `${text}${line}`
    return `${text} ${line}`
  }, '').replace(/\n+$/, '')
}

/**
 * Decode the frontmatter block with a real YAML parser.
 *
 * Returns null when the block is not a mapping or the parser reports an error,
 * so a malformed SKILL.md still reaches the lenient scanner below.
 */
function parseYamlMapping(source: string): Record<string, unknown> | null {
  try {
    const doc = parseDocument(source, { logLevel: 'silent', uniqueKeys: false })
    if (doc.errors.length)
      return null
    const value = doc.toJS({ maxAliasCount: 100 })
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null
    return value as Record<string, unknown>
  }
  catch {
    // A YAML parse failure is expected input, not a fault: fall back to the
    // lenient line scanner so a broken SKILL.md still yields what it can.
    return null
  }
}

function parseFrontmatterLines(block: string): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {}
  const lines = block.split(NEWLINE_SPLIT_RE)
  for (let index = 0; index < lines.length; index++) {
    const keyMatch = lines[index]!.match(KEY_LINE_RE)
    if (!keyMatch)
      continue

    const key = keyMatch[1]!
    const rawValue = keyMatch[2]!.trim()
    const blockMatch = rawValue.match(BLOCK_SCALAR_RE)
    if (!blockMatch) {
      frontmatter[key] = parseFrontmatterValue(rawValue)
      continue
    }

    const blockLines: string[] = []
    while (index + 1 < lines.length && (!lines[index + 1]!.trim() || /^\s/.test(lines[index + 1]!)))
      blockLines.push(lines[++index]!)
    frontmatter[key] = parseBlockScalar(blockMatch[1]!, blockLines)
  }

  return frontmatter
}

/**
 * Split a SKILL.md into its frontmatter mapping and its body.
 *
 * This is the one boundary where untrusted SKILL.md text becomes data. The
 * block is decoded by the YAML parser, so quoted scalars, block scalars, and
 * multi-line values arrive already unescaped. Callers trust the result.
 */
export function parseFrontmatterDocument(raw: string): ParsedFrontmatterDocument {
  const match = raw.match(FRONTMATTER_RE)
  if (!match)
    return { frontmatter: {}, body: raw }

  const block = match[1]!
  return {
    frontmatter: parseYamlMapping(block) ?? parseFrontmatterLines(block),
    body: match[2] ?? '',
  }
}

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
  const fm: SkillFrontmatter = {}
  for (const [key, value] of Object.entries(parseFrontmatterDocument(raw).frontmatter)) {
    if (typeof value === 'string')
      fm[key] = value
  }
  return fm
}

const SLUGIFY_STRIP_RE = /[^a-z0-9-]+/g
const SLUGIFY_DEDUPE_DASH_RE = /-+/g
const SLUGIFY_TRIM_DASH_RE = /^-+|-+$/g

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
 * `name` (slug) always derives from `dirName`. Frontmatter `name:` is treated
 * as a display title, not a slug.
 */
export function parseSkillFile(raw: string, dirName: string): ParsedSkill | null {
  const name = slugifySkillName(dirName)
  if (!name)
    return null
  const fm = raw ? parseFrontmatter(raw) : {}
  const fmName = fm.name?.trim()
  return {
    name,
    displayName: fmName || name,
    description: fm.description?.trim() || null,
  }
}
