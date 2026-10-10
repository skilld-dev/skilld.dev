import { parseDocument } from 'yaml'

export interface SkillValidationIssue {
  field: string
  severity: 'error' | 'notice'
  message: string
}

const BASE_FIELDS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'])
// https://code.claude.com/docs/en/skills#frontmatter-reference
const CLAUDE_FIELDS = new Set(['argument-hint', 'disable-model-invocation', 'user-invocable', 'model', 'context', 'agent', 'hooks', 'effort'])

/** Validate source bytes, without the registry's lenient display parser. */
export function validateSkillFrontmatter(raw: string, path: string, repository: string): SkillValidationIssue[] {
  const issues: SkillValidationIssue[] = []
  const add = (field: string, message: string, severity: SkillValidationIssue['severity'] = 'error') => issues.push({ field, message, severity })
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) {
    add('frontmatter', 'Add a YAML frontmatter block before the instructions.')
    return issues
  }
  const document = parseDocument(match[1]!, { uniqueKeys: true, logLevel: 'silent' })
  if (document.errors.length || document.warnings.length) {
    add('yaml', 'Fix malformed YAML or duplicate frontmatter fields.')
    return issues
  }
  let mapping: unknown
  try {
    mapping = document.toJS({ mapAsMap: true, maxAliasCount: 100 })
  }
  catch {
    // Alias expansion is expected invalid author input, not an infrastructure failure.
    add('yaml', 'Replace recursive or excessive YAML aliases.')
    return issues
  }
  if (!(mapping instanceof Map)) {
    add('frontmatter', 'Use a YAML mapping for frontmatter.')
    return issues
  }
  const sourceName = mapping.get('name')
  const name = typeof sourceName === 'string' ? sourceName.normalize('NFKC') : sourceName
  const expected = path === 'SKILL.md' ? repository : path.split('/').at(-2)
  if (typeof name !== 'string' || !name || [...name].length > 64 || name !== name.toLowerCase()
    || !/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(name)) {
    add('name', 'Use 1 to 64 lowercase letters, numbers, or single hyphens for name.')
  }
  else if (name.normalize('NFKC') !== expected?.normalize('NFKC')) {
    add('name', `Set name to the Skill folder name: ${expected}.`)
  }
  const description = mapping.get('description')
  if (typeof description !== 'string' || !description.trim() || [...description].length > 1024)
    add('description', 'Use a nonempty description with at most 1024 characters.')
  for (const field of ['license', 'allowed-tools']) {
    if (mapping.has(field) && typeof mapping.get(field) !== 'string')
      add(field, `Use a string for ${field}.`)
  }
  if (mapping.has('compatibility')) {
    const value = mapping.get('compatibility')
    if (typeof value !== 'string' || !value.trim() || [...value].length > 500)
      add('compatibility', 'Use 1 to 500 characters for compatibility, or omit it.')
  }
  if (mapping.has('metadata')) {
    const value = mapping.get('metadata')
    if (!(value instanceof Map) || [...value].some(([key, item]) => typeof key !== 'string' || typeof item !== 'string'))
      add('metadata', 'Use string keys and string values in metadata. Quote version numbers.')
  }
  let claudeExtensions = false
  for (const key of mapping.keys()) {
    if (typeof key !== 'string') {
      add('frontmatter', 'Use string keys for frontmatter fields.')
    }
    else if (CLAUDE_FIELDS.has(key)) {
      claudeExtensions = true
    }
    else if (!BASE_FIELDS.has(key)) {
      const message = key === 'user_invocable'
        ? 'Replace user_invocable with the Claude Code field user-invocable, or omit it.'
        : key === 'version'
          ? 'Move version into metadata.version and quote its value.'
          : `Move the unsupported field ${key} into metadata, or remove it.`
      add(key, message)
    }
  }
  if (claudeExtensions)
    add('claude-code', 'Claude Code fields may not work in other Agents.', 'notice')
  if (raw.split(/\r?\n/).length > 500)
    add('body', 'Keep SKILL.md under 500 lines. Move detail into linked reference files.', 'notice')
  return issues
}
