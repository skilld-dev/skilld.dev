import type { Token } from 'marked'
import { Lexer } from 'marked'

export type SkillReferenceToken = {
  _tag: 'text'
  value: string
} | {
  _tag: 'dependency'
  name: string
}

export interface SkillDependencySource {
  owner: string
  repo: string
  name: string
  raw: string | null
}

const SKIP_TOKEN_TYPES = new Set(['code', 'escape', 'html', 'image', 'link', 'tag'])
const CHILD_KEYS = ['tokens', 'items', 'header', 'rows'] as const

function markdownBody(raw: string): string {
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/)
  return match?.[1] ?? raw
}

function skillNameIndex(skillNames: string[], currentSkill: string): Map<string, string> {
  const current = currentSkill.toLowerCase()
  return new Map(skillNames
    .filter(name => name.toLowerCase() !== current)
    .map(name => [name.toLowerCase(), name]),
  )
}

export function createSkillReferenceTokenizer(
  skillNames: string[],
  currentSkill: string,
): (text: string) => SkillReferenceToken[] {
  const names = skillNameIndex(skillNames, currentSkill)
  return (text) => {
    if (names.size === 0 || !text.includes('/'))
      return [{ _tag: 'text', value: text }]

    const tokens: SkillReferenceToken[] = []
    let cursor = 0
    for (const match of text.matchAll(/(^|[^\w/-])\/([a-z0-9][a-z0-9-]*)(?=$|[^\w/-])/gi)) {
      const prefix = match[1] ?? ''
      const matchedName = match[2]
      const dependency = matchedName ? names.get(matchedName.toLowerCase()) : null
      if (!dependency)
        continue

      const slashIndex = (match.index ?? 0) + prefix.length
      if (slashIndex > cursor)
        tokens.push({ _tag: 'text', value: text.slice(cursor, slashIndex) })
      tokens.push({ _tag: 'dependency', name: dependency })
      cursor = slashIndex + matchedName!.length + 1
    }
    if (cursor < text.length)
      tokens.push({ _tag: 'text', value: text.slice(cursor) })
    return tokens.length ? tokens : [{ _tag: 'text', value: text }]
  }
}

export function tokenizeSkillReferences(
  text: string,
  skillNames: string[],
  currentSkill: string,
): SkillReferenceToken[] {
  return createSkillReferenceTokenizer(skillNames, currentSkill)(text)
}

function collectDependencies(
  value: unknown,
  tokenize: (text: string) => SkillReferenceToken[],
  dependencies: Set<string>,
): void {
  if (Array.isArray(value)) {
    for (const item of value)
      collectDependencies(item, tokenize, dependencies)
    return
  }
  if (!value || typeof value !== 'object')
    return

  const token = value as Token & Record<string, unknown>
  if (typeof token.type === 'string' && SKIP_TOKEN_TYPES.has(token.type))
    return
  if (token.type === 'codespan' && typeof token.text === 'string') {
    const parts = tokenize(token.text)
    if (parts.length === 1 && parts[0]?._tag === 'dependency')
      dependencies.add(parts[0].name)
    return
  }
  if (token.type === 'text' && typeof token.text === 'string') {
    for (const part of tokenize(token.text)) {
      if (part._tag === 'dependency')
        dependencies.add(part.name)
    }
    return
  }
  for (const key of CHILD_KEYS)
    collectDependencies(token[key], tokenize, dependencies)
}

export function extractSkillDependenciesFromMarkdown(
  raw: string,
  skillNames: string[],
  currentSkill: string,
): string[] {
  if (!raw || skillNames.length === 0)
    return []
  const dependencies = new Set<string>()
  const tokenize = createSkillReferenceTokenizer(skillNames, currentSkill)
  collectDependencies(
    Lexer.lex(markdownBody(raw), { gfm: true }),
    tokenize,
    dependencies,
  )
  return [...dependencies]
}

export function skillDependencyKey(owner: string, repo: string, name: string): string {
  return `${owner}/${repo}/${name}`
}

export function buildSkillDependencyMap(sources: SkillDependencySource[]): Map<string, string[]> {
  const namesByRepo = new Map<string, string[]>()
  for (const source of sources) {
    const repoKey = `${source.owner}/${source.repo}`
    const names = namesByRepo.get(repoKey) ?? []
    names.push(source.name)
    namesByRepo.set(repoKey, names)
  }

  return new Map(sources.map((source) => {
    const repoKey = `${source.owner}/${source.repo}`
    return [
      skillDependencyKey(source.owner, source.repo, source.name),
      extractSkillDependenciesFromMarkdown(
        source.raw ?? '',
        namesByRepo.get(repoKey) ?? [],
        source.name,
      ),
    ]
  }))
}
